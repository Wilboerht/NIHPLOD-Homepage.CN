/**
 * 管理端用户积分 API
 * GET  /api/admin/users/[id]/points - 积分余额与流水分页（含物化：过期）
 * POST /api/admin/users/[id]/points - 人工调整积分（仅超级管理员，审计 user_points_adjust）
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { adjustPoints, getPointBalanceView } from "@/lib/points-ledger";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const adjustSchema = z.object({
  amount: z
    .number()
    .int("调整分值必须为整数")
    .refine((v) => v !== 0, "调整分值不能为 0")
    .refine((v) => Math.abs(v) <= 1000000, "单次调整绝对值不能超过 1,000,000"),
  note: z.string().trim().min(2, "请填写调整原因（至少 2 个字）").max(200, "调整原因过长"),
  requestId: z.string().min(1).max(64).optional(),
});

/** GET：余额 + 流水分页 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    const { id } = await params;
    if (!validateCUID(id)) return invalidIdResponse();

    const rateLimitResponse = await checkAdminRateLimit(request, "admin-user-points:read");
    if (rateLimitResponse) return rateLimitResponse;

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      page: searchParams.get("page") || "1",
      pageSize: searchParams.get("pageSize") || "20",
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }
    const { page, pageSize } = parsed.data;

    const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    const data = await prisma.$transaction(async (tx) => {
      const balance = await getPointBalanceView(tx, id);
      const [items, total] = await Promise.all([
        tx.pointLedger.findMany({
          where: { userId: id },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            type: true,
            amount: true,
            remaining: true,
            note: true,
            expiresAt: true,
            createdAt: true,
          },
        }),
        tx.pointLedger.count({ where: { userId: id } }),
      ]);
      return {
        available: balance.available,
        frozen: balance.frozen,
        items: items.map((r) => ({
          id: r.id,
          type: r.type,
          amount: r.amount,
          remaining: r.remaining,
          note: r.note,
          expiresAt: r.expiresAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        })),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    apiConsole.error("[AdminUserPoints] 查询失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

/** POST：人工调整积分（仅超级管理员） */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }
    if (admin.role !== "owner") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "仅超级管理员可调整用户积分" } },
        { status: 403 }
      );
    }

    const { id } = await params;
    if (!validateCUID(id)) return invalidIdResponse();

    const rateLimitResponse = await checkAdminRateLimit(request, "admin-user-points:adjust");
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const parsed = adjustSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message || "参数错误" },
        },
        { status: 400 }
      );
    }
    const { amount, note, requestId } = parsed.data;

    const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    // 幂等键：客户端重试可复用 requestId；缺省时服务端生成
    const reference = `admin-adjust:${requestId ?? randomUUID()}`;

    const result = await prisma.$transaction(async (tx) => {
      const adjusted = await adjustPoints(tx, { userId: id, amount, reference, note });
      if (adjusted.duplicated) return { duplicated: true, available: null as number | null };
      const balance = await tx.pointBalance.findUnique({
        where: { userId: id },
        select: { available: true },
      });
      return { duplicated: false, available: balance?.available ?? 0 };
    });

    if (!result.duplicated) {
      await createAuditLog({
        action: "user_points_adjust",
        targetType: "user",
        targetId: id,
        detail: { amount, note, reference, balanceAfter: result.available },
        adminId: admin.id,
        request,
      });
    }

    return NextResponse.json({
      success: true,
      data: { duplicated: result.duplicated, available: result.available, amount },
    });
  } catch (error) {
    apiConsole.error("[AdminUserPoints] 调整失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "积分调整失败" } },
      { status: 500 }
    );
  }
}
