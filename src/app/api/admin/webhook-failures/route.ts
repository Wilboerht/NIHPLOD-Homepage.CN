/**
 * Webhook / Backchannel 失败补偿队列管理 API（管理端，仅超级管理员）
 * GET  /api/admin/webhook-failures - 失败队列列表（kind=webhook|backchannel）
 * POST /api/admin/webhook-failures - 手动重投 / 丢弃单条失败记录
 *
 * 队列说明：资料变更 Webhook（WebhookDeliveryFailure）与 Backchannel Logout
 * （BackchannelLogoutFailure）由 cron 按指数退避自动重投，达到 10 次上限后丢弃；
 * 本接口提供人工查看与立即重投，便于运维介入。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { maskPhone } from "@/lib/mask-phone";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { retryWebhookFailureById } from "@/lib/profile-webhook";
import { retryBackchannelFailureById } from "@/lib/backchannel-logout";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  kind: z.enum(["webhook", "backchannel"]).default("webhook"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const actionSchema = z.object({
  kind: z.enum(["webhook", "backchannel"]),
  id: z.string().cuid(),
  action: z.enum(["retry", "delete"]),
});

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }
    if (!hasAdminPermission(admin, "webhooks:read")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：失败队列查看" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "webhook-failures:read");
    if (rateLimitResponse) return rateLimitResponse;

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      kind: searchParams.get("kind") || "webhook",
      page: searchParams.get("page") || "1",
      pageSize: searchParams.get("pageSize") || "20",
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }
    const { kind, page, pageSize } = parsed.data;
    const skip = (page - 1) * pageSize;

    const [items, total, webhookCount, backchannelCount] = await Promise.all([
      kind === "webhook"
        ? prisma.webhookDeliveryFailure.findMany({
            orderBy: { nextRetryAt: "asc" },
            skip,
            take: pageSize,
          })
        : prisma.backchannelLogoutFailure.findMany({
            orderBy: { nextRetryAt: "asc" },
            skip,
            take: pageSize,
          }),
      kind === "webhook"
        ? prisma.webhookDeliveryFailure.count()
        : prisma.backchannelLogoutFailure.count(),
      prisma.webhookDeliveryFailure.count(),
      prisma.backchannelLogoutFailure.count(),
    ]);

    // 补充用户与客户端展示信息（失败队列无外键关联，手动映射）
    const userIds = [...new Set(items.map((i) => i.userId))];
    const clientIds = [...new Set(items.map((i) => i.clientId))];
    const [users, clients] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, phone: true, nickname: true },
      }),
      prisma.oAuthClient.findMany({
        where: { clientId: { in: clientIds } },
        select: { clientId: true, name: true },
      }),
    ]);
    const userMap = new Map(users.map((u) => [u.id, u]));
    const clientMap = new Map(clients.map((c) => [c.clientId, c]));

    return NextResponse.json({
      success: true,
      data: {
        kind,
        items: items.map((item) => {
          const user = userMap.get(item.userId);
          const client = clientMap.get(item.clientId);
          return {
            id: item.id,
            userId: item.userId,
            userPhone: user?.phone ? maskPhone(user.phone) : null,
            userNickname: user?.nickname ?? null,
            clientId: item.clientId,
            clientName: client?.name ?? null,
            attempts: item.attempts,
            nextRetryAt: item.nextRetryAt.toISOString(),
            createdAt: item.createdAt.toISOString(),
            // 不回传 payload：其中含手机号等用户资料快照（PII），
            // 仅保留定位所需元数据；需要排查时走服务端日志。
            hasPayload: Boolean(item.payload),
          };
        }),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
        counts: { webhook: webhookCount, backchannel: backchannelCount },
      },
    });
  } catch (error) {
    apiConsole.error("[AdminWebhookFailures] 查询失败:", error);
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
    if (!hasAdminPermission(admin, "webhooks:write")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：失败队列操作" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "webhook-failures:write");
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }
    const { kind, id, action } = parsed.data;
    if (!validateCUID(id)) return invalidIdResponse();

    if (action === "delete") {
      const result =
        kind === "webhook"
          ? await prisma.webhookDeliveryFailure.deleteMany({ where: { id } })
          : await prisma.backchannelLogoutFailure.deleteMany({ where: { id } });
      if (result.count === 0) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "记录不存在" } },
          { status: 404 }
        );
      }
      await createAuditLog({
        action: "webhook_failure_delete",
        targetType: "system",
        targetId: id,
        detail: { kind },
        adminId: admin.id,
        request,
      });
      return NextResponse.json({ success: true, data: { status: "deleted", message: "记录已丢弃" } });
    }

    const result =
      kind === "webhook"
        ? await retryWebhookFailureById(id)
        : await retryBackchannelFailureById(id);

    if (result.status === "not_found") {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "记录不存在" } },
        { status: 404 }
      );
    }

    await createAuditLog({
      action: "webhook_failure_retry",
      targetType: "system",
      targetId: id,
      detail: { kind, status: result.status, attempts: result.attempts ?? null },
      adminId: admin.id,
      request,
    });

    const messages: Record<string, string> = {
      delivered: "重投成功，记录已移除",
      failed: "重投失败，已按退避策略安排下次重试",
      dropped: "目标不可用或已达重试上限，记录已丢弃",
    };

    return NextResponse.json({
      success: true,
      data: { status: result.status, message: messages[result.status], error: result.error ?? null },
    });
  } catch (error) {
    apiConsole.error("[AdminWebhookFailures] 操作失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
