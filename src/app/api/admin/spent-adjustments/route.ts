/**
 * 消费补录审核 API（管理端）
 * GET  /api/admin/spent-adjustments - 补录申请列表（按状态筛选 + 分页）
 * POST /api/admin/spent-adjustments - 代客提交补录申请（需 spent:create）
 *
 * 审核操作见 [id]/review 路由。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { validateCUID } from "@/lib/validation";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { maskPhone } from "@/lib/mask-phone";
import {
  SPENT_CHANNEL_LABELS,
  SPENT_SOURCE_LABELS,
  SPENT_STATUS_LABELS,
} from "@/lib/spent-adjustments";
import {
  createSpentApplication,
  createSpentApplicationSchema,
} from "@/lib/spent-adjustment-applications";
import { MAX_PENDING_PER_USER } from "@/lib/spent-adjustment-meta";

const querySchema = z.object({
  page: z.preprocess((val) => (val ? Number(val) : 1), z.number().min(1)),
  pageSize: z.preprocess((val) => (val ? Number(val) : 20), z.number().min(1).max(100)),
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  search: z.string().max(100).optional(),
});

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    if (!hasAdminPermission(admin, "spent:read")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：消费记录查看" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "spent-adjust:read");
    if (rateLimitResponse) return rateLimitResponse;

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
      status: searchParams.get("status") || undefined,
      search: searchParams.get("search")?.trim() || undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }

    const { page, pageSize, status, search } = parsed.data;

    const where: Prisma.SpentAdjustmentApplicationWhereInput = status ? { status } : {};
    if (search) {
      where.OR = [
        { orderNo: { contains: search, mode: "insensitive" } },
        { user: { phone: { contains: search } } },
        { user: { nickname: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [applications, total, statusCounts] = await Promise.all([
      prisma.spentAdjustmentApplication.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        select: {
          id: true,
          channel: true,
          orderNo: true,
          dealerName: true,
          amountClaimed: true,
          purchasedAt: true,
          images: true,
          note: true,
          status: true,
          source: true,
          reviewAmount: true,
          reviewNote: true,
          reviewedAt: true,
          createdAt: true,
          user: { select: { id: true, phone: true, nickname: true, membershipLevel: true } },
          reviewedBy: { select: { name: true, email: true } },
          createdByAdmin: { select: { name: true, email: true } },
        },
      }),
      prisma.spentAdjustmentApplication.count({ where }),
      prisma.spentAdjustmentApplication.groupBy({
        by: ["status"],
        _count: true,
      }),
    ]);

    const counts: Record<string, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
    for (const row of statusCounts) {
      counts[row.status] = row._count;
    }

    return NextResponse.json({
      success: true,
      data: {
        applications: applications.map((a) => ({
          ...a,
          channelLabel: SPENT_CHANNEL_LABELS[a.channel],
          statusLabel: SPENT_STATUS_LABELS[a.status],
          sourceLabel: SPENT_SOURCE_LABELS[a.source],
          user: {
            id: a.user.id,
            phone: maskPhone(a.user.phone),
            nickname: a.user.nickname,
            membershipLevel: a.user.membershipLevel,
          },
          purchasedAt: a.purchasedAt?.toISOString() ?? null,
          createdAt: a.createdAt.toISOString(),
          reviewedAt: a.reviewedAt?.toISOString() ?? null,
        })),
        counts,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    apiConsole.error("[AdminSpentAdjustment] 查询失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

/**
 * 代客提交消费补录申请。
 *
 * 仅创建 PENDING 申请，不直接入账；能否审核仍由 spent:review 权限决定。
 * 拥有 spent:review 的管理员可在提交后自行审核，仅有 spent:create 的客服
 * 需由其他有审核权限的管理员处理，保持资金操作分离。
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    if (!hasAdminPermission(admin, "spent:create")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：消费补录代客填写" } },
        { status: 403 }
      );
    }

    if (!validateCSRFToken(request)) {
      return csrfForbiddenResponse();
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "spent-adjust:create", admin.id);
    if (rateLimitResponse) return rateLimitResponse;

    let body: Record<string, unknown>;
    try {
      const parsedBody = await request.json();
      if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
        throw new Error("invalid body");
      }
      body = parsedBody as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }

    const { userId, ...inputRaw } = body;
    if (typeof userId !== "string" || !validateCUID(userId)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "请选择有效的用户" } },
        { status: 400 }
      );
    }

    const parsed = createSpentApplicationSchema.safeParse(inputRaw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message || "参数错误" },
        },
        { status: 400 }
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: { code: "USER_NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }
    if (targetUser.status !== "ACTIVE") {
      return NextResponse.json(
        {
          success: false,
          error: { code: "USER_INACTIVE", message: "该用户当前状态不可提交消费补录" },
        },
        { status: 409 }
      );
    }

    // 资金类记录由管理员代填：审计预写失败则拒绝创建（与审核/导入口径一致）
    // finishAuditLog 会整体替换 detail，因此失败/成功分支都需要带上完整上下文。
    const auditDetail = {
      targetUserId: userId,
      channel: SPENT_CHANNEL_LABELS[parsed.data.channel],
      orderNo: parsed.data.orderNo,
      dealerName: parsed.data.channel === "DEALER" ? parsed.data.dealerName : undefined,
      amountClaimed: parsed.data.amountClaimed,
    };
    const auditId = await beginAuditLog({
      action: "admin_create_spent_adjustment",
      targetType: "spent_adjustment",
      detail: auditDetail,
      actorType: "ADMIN",
      actorEmail: admin.email,
      actorName: admin.name,
      actorRole: admin.role,
      authMethod: "session",
      adminId: admin.id,
      request,
    });
    if (!auditId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "AUDIT_UNAVAILABLE", message: "审计服务不可用，已拒绝操作" },
        },
        { status: 503 }
      );
    }

    let result: Awaited<ReturnType<typeof createSpentApplication>>;
    try {
      result = await createSpentApplication({
        userId,
        input: parsed.data,
        request,
        actor: {
          adminId: admin.id,
          adminName: admin.name,
          adminEmail: admin.email,
          adminRole: admin.role,
        },
        skipAudit: true,
      });
    } catch (error) {
      await finishAuditLog(auditId, "FAILURE", { ...auditDetail, error: "EXCEPTION" });
      throw error;
    }

    if (!result.ok) {
      await finishAuditLog(auditId, "FAILURE", { ...auditDetail, code: result.kind });
      if (result.kind === "invalid_image") {
        return NextResponse.json(
          { success: false, error: { code: "INVALID_IMAGE", message: "凭证图片无效" } },
          { status: 400 }
        );
      }
      if (result.kind === "order_imported") {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "ORDER_ALREADY_IMPORTED",
              message: "该订单号已通过消费记录导入入账，请勿重复提交",
            },
          },
          { status: 409 }
        );
      }
      if (result.kind === "order_claimed") {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "ORDER_CONFLICT",
              message: "该订单号已在其他渠道入账，请核对后重试",
            },
          },
          { status: 409 }
        );
      }
      if (result.kind === "pending_limit") {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "PENDING_LIMIT",
              message: `该用户最多同时有 ${MAX_PENDING_PER_USER} 条待审核申请，请等待审核完成后再提交`,
            },
          },
          { status: 400 }
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "ORDER_NO_DUPLICATE",
            message: "该用户已有相同订单号待审核或已通过的申请，请勿重复提交",
          },
        },
        { status: 409 }
      );
    }

    await finishAuditLog(
      auditId,
      "SUCCESS",
      {
        ...auditDetail,
        applicationId: result.application.id,
        idempotent: result.idempotent ?? false,
      },
      result.application.id
    );

    return NextResponse.json({
      success: true,
      data: {
        application: {
          id: result.application.id,
          status: result.application.status,
          statusLabel: result.application.statusLabel,
        },
        idempotent: result.idempotent ?? false,
      },
    });
  } catch (error) {
    apiConsole.error("[AdminSpentAdjustment] 代客提交失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
