/**
 * 事务通知 Outbox 管理 API
 * GET  /api/admin/notification-outbox - 队列列表与统计
 * POST /api/admin/notification-outbox - 重试/丢弃（step-up + 审计）
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { requireAdminStepUp } from "@/lib/admin-totp";
import { discardNotificationOutbox, requeueNotificationOutbox } from "@/lib/notification-outbox";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  status: z.enum(["PENDING", "SENDING", "SENT", "DEAD", "SKIPPED"]).optional(),
  channel: z.enum(["SMS", "WECHAT_TEMPLATE", "MINIPROGRAM", "WECOM"]).optional(),
  eventType: z.string().max(80).optional(),
});

const actionSchema = z.object({
  id: z.string().min(1).max(100),
  action: z.enum(["retry", "discard"]),
});

function maskRecipient(value: unknown): unknown {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const phone = typeof record.phone === "string" ? record.phone : null;
  return {
    ...record,
    ...(phone
      ? { phone: phone.length >= 7 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : "***" }
      : {}),
  };
}

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }
    if (!hasAdminPermission(admin, "notifications:read")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：事务通知查看" } },
        { status: 403 }
      );
    }
    const rateLimitResponse = await checkAdminRateLimit(
      request,
      "notification-outbox:read",
      admin.id
    );
    if (rateLimitResponse) return rateLimitResponse;

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      page: searchParams.get("page") || undefined,
      pageSize: searchParams.get("pageSize") || undefined,
      status: searchParams.get("status") || undefined,
      channel: searchParams.get("channel") || undefined,
      eventType: searchParams.get("eventType") || undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }

    const { page, pageSize, status, channel, eventType } = parsed.data;
    const where = {
      ...(status ? { status } : {}),
      ...(channel ? { channel } : {}),
      ...(eventType ? { eventType } : {}),
    };

    const [items, total, grouped] = await Promise.all([
      prisma.notificationOutbox.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.notificationOutbox.count({ where }),
      prisma.notificationOutbox.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
    ]);

    return NextResponse.json(
      {
        success: true,
        data: {
          items: items.map((item) => ({
            id: item.id,
            idempotencyKey: item.idempotencyKey,
            channel: item.channel,
            eventType: item.eventType,
            aggregateType: item.aggregateType,
            aggregateId: item.aggregateId,
            userId: item.userId,
            recipient: maskRecipient(item.recipient),
            templateKey: item.templateKey,
            status: item.status,
            attempts: item.attempts,
            maxAttempts: item.maxAttempts,
            nextAttemptAt: item.nextAttemptAt.toISOString(),
            lastError: item.lastError,
            providerMessageId: item.providerMessageId,
            sentAt: item.sentAt?.toISOString() ?? null,
            createdAt: item.createdAt.toISOString(),
            updatedAt: item.updatedAt.toISOString(),
          })),
          pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
          counts: Object.fromEntries(grouped.map((row) => [row.status, row._count._all])),
        },
      },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    apiConsole.error("[NotificationOutbox] 查询失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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
    if (!hasAdminPermission(admin, "notifications:write")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：事务通知操作" } },
        { status: 403 }
      );
    }
    const rateLimitResponse = await checkAdminRateLimit(
      request,
      "notification-outbox:write",
      admin.id
    );
    if (rateLimitResponse) return rateLimitResponse;
    const stepUpResponse = await requireAdminStepUp(request, admin);
    if (stepUpResponse) return stepUpResponse;

    const parsed = actionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }
    const { id, action } = parsed.data;
    const row = await prisma.notificationOutbox.findUnique({
      where: { id },
      select: { id: true, status: true, eventType: true, channel: true },
    });
    if (!row) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "通知不存在" } },
        { status: 404 }
      );
    }

    const auditId = await beginAuditLog({
      action: action === "retry" ? "notification_outbox_retry" : "notification_outbox_drop",
      targetType: "notification",
      targetId: id,
      detail: { eventType: row.eventType, channel: row.channel, previousStatus: row.status },
      adminId: admin.id,
      request,
    });
    if (!auditId) {
      return NextResponse.json(
        { success: false, error: { code: "AUDIT_UNAVAILABLE", message: "审计不可用，已拒绝操作" } },
        { status: 503 }
      );
    }

    const changed =
      action === "retry"
        ? await requeueNotificationOutbox(id)
        : await discardNotificationOutbox(id);
    if (!changed) {
      await finishAuditLog(auditId, "FAILURE", { reason: "INVALID_STATUS" });
      return NextResponse.json(
        { success: false, error: { code: "INVALID_STATUS", message: "当前状态不允许该操作" } },
        { status: 409 }
      );
    }

    await finishAuditLog(auditId, "SUCCESS", { action });
    return NextResponse.json({
      success: true,
      data: { message: action === "retry" ? "已重新入队" : "已丢弃" },
    });
  } catch (error) {
    apiConsole.error("[NotificationOutbox] 操作失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
