/**
 * 导入批次详情 API（管理端只读）
 * GET /api/admin/spent-import/[id]?page=&pageSize=&status=
 *
 * 权限：spent:import（与导入历史一致）
 * 只返回脱敏手机号；备注/订单号供财务对账使用。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { maskPhone } from "@/lib/mask-phone";
import { SPENT_CHANNEL_LABELS } from "@/lib/spent-adjustment-meta";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  page: z.preprocess((val) => (val ? Number(val) : 1), z.number().min(1)),
  pageSize: z.preprocess((val) => (val ? Number(val) : 20), z.number().min(1).max(1000)),
  status: z.enum(["ALL", "SUCCESS", "DUPLICATE", "ERROR"]).default("ALL"),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    if (!hasAdminPermission(admin, "spent:import")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：导入批次详情" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "spent-import:read");
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await context.params;
    if (!validateCUID(id)) return invalidIdResponse();

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
      status: searchParams.get("status") || "ALL",
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }
    const { page, pageSize, status } = parsed.data;

    const batch = await prisma.spentImportBatch.findUnique({
      where: { id },
      select: {
        id: true,
        fileName: true,
        reason: true,
        status: true,
        totalRows: true,
        successRows: true,
        duplicateRows: true,
        errorRows: true,
        totalAmount: true,
        lastError: true,
        startedAt: true,
        finishedAt: true,
        undoneAt: true,
        createdAt: true,
        admin: { select: { name: true } },
      },
    });
    if (!batch) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "导入批次不存在" } },
        { status: 404 }
      );
    }

    const rowWhere = {
      batchId: id,
      ...(status === "ALL" ? {} : { status }),
    };
    const [rows, total] = await Promise.all([
      prisma.spentImportRow.findMany({
        where: rowWhere,
        orderBy: { createdAt: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          rowIndex: true,
          phone: true,
          amount: true,
          channel: true,
          orderNo: true,
          purchasedAt: true,
          note: true,
          status: true,
          error: true,
          appliedDelta: true,
          revertedAt: true,
          createdAt: true,
        },
      }),
      prisma.spentImportRow.count({ where: rowWhere }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        batch: {
          ...batch,
          adminName: batch.admin.name,
          startedAt: batch.startedAt.toISOString(),
          finishedAt: batch.finishedAt?.toISOString() ?? null,
          undoneAt: batch.undoneAt?.toISOString() ?? null,
          createdAt: batch.createdAt.toISOString(),
        },
        rows: rows.map((row) => ({
          ...row,
          phone: maskPhone(row.phone),
          channelLabel: row.channel ? SPENT_CHANNEL_LABELS[row.channel] : null,
          purchasedAt: row.purchasedAt?.toISOString() ?? null,
          revertedAt: row.revertedAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
        })),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    apiConsole.error("[AdminSpentImportDetail] 查询失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
