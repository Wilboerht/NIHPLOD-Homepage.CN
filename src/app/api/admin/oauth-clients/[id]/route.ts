/**
 * 管理端单个 OAuth Client API
 * GET    /api/admin/oauth-clients/[id] — 详情
 * PATCH  /api/admin/oauth-clients/[id] — 更新
 * DELETE /api/admin/oauth-clients/[id] — 硬删除（含关联数据级联清理）
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import {
  getOAuthClientById,
  updateOAuthClient,
  deleteOAuthClient,
  toSafeClientResponse,
} from "@/lib/oauth-client";
import { createAuditLog } from "@/lib/audit";
import { recordSsoEvent } from "@/lib/sso-audit";
import { getClientIP } from "@/lib/ratelimit";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { enqueueBackchannelLogoutForActiveSessions, scheduleBackchannelRedelivery } from "@/lib/backchannel-logout";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

/**
 * 审计日志仅记录白名单内的可编辑字段。
 * 禁止把原始请求体整体写入审计：管理员误粘贴的 clientSecret 等凭证会被永久留存。
 */
const AUDITABLE_UPDATE_FIELDS = [
  "name",
  "redirectUris",
  "postLogoutRedirectUris",
  "scopes",
  "isActive",
  "isPublic",
  "backchannelLogoutUri",
  "webhookUri",
  "codeTtlSeconds",
  "accessTokenTtlSeconds",
] as const;

function sanitizeClientPatchForAudit(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const source = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of AUDITABLE_UPDATE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    // 纵深防御：字段名含 secret 的一律不落审计（理论上白名单已排除）
    if (/secret/i.test(key)) continue;
    // 数组字段限制记录条数，避免超长请求体放大审计存储
    const value = source[key];
    out[key] = Array.isArray(value) ? value.slice(0, 50) : value;
  }
  return out;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    if (!hasAdminPermission(admin, "sso:clients:read")) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "FORBIDDEN", message: "权限不足：SSO 客户端查看" },
        },
        { status: 403 }
      );
    }

    const rateLimitResult = await checkAdminRateLimit(request, "admin-oauth-client-detail");
    if (rateLimitResult) return rateLimitResult;

    const { id } = await context.params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const client = await getOAuthClientById(id);
    if (!client) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Client 不存在" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: { client: toSafeClientResponse(client) } });
  } catch (error) {
    apiConsole.error("[AdminOAuthClient] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
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
    if (!hasAdminPermission(admin, "sso:clients:write")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：SSO 客户端管理" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await context.params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const body = await request.json();

    // 更新前获取原状态，用于判断是否需要级联撤销
    const previousClient = await getOAuthClientById(id);
    if (!previousClient) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Client 不存在" } },
        { status: 404 }
      );
    }

    const client = await updateOAuthClient(id, body);

    if (!client) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Client 不存在" } },
        { status: 404 }
      );
    }

    // Client 从活跃变为停用时：级联撤销 session/token 并通知 RP
    if (previousClient.isActive && client.isActive === false) {
      try {
        const clientId = client.clientId;

        // 分页扫描活跃会话并写入 backchannel 补偿队列（不同步 HTTP）：
        // 避免大 client 停用时无界查询 + 逐用户串行投递拖垮请求
        const enqueued = await enqueueBackchannelLogoutForActiveSessions({ clientId });

        // 撤销所有活跃 OAuthSession 与 RefreshToken
        await prisma.$transaction(async (tx) => {
          await tx.oAuthSession.updateMany({
            where: { clientId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          await tx.refreshToken.updateMany({
            where: { clientId, revokedAt: null },
            data: { revokedAt: new Date(), revokedReason: "admin_revoke" },
          });
        });

        apiConsole.info(
          `[AdminOAuthClient PATCH] 停用 ${clientId}：撤销 ${enqueued.sessionCount} 个会话，入队 ${enqueued.userClientCount} 条 backchannel 通知`
        );
        // 响应后立即补投小批量，避免等待 cron 周期
        scheduleBackchannelRedelivery();
      } catch (err) {
        apiConsole.error("[AdminOAuthClient PATCH] 停用 Client 级联撤销失败:", err);
      }
    }

    // SSO 审计：client 生命周期变更（合规敏感，同步等待写入）
    await recordSsoEvent({
      event: "status_change",
      clientId: client.clientId,
      clientName: client.name,
      ip: getClientIP(request),
      success: true,
      detail: {
        action: "client_updated",
        isActiveTransition:
          previousClient.isActive !== client.isActive
            ? `${previousClient.isActive} -> ${client.isActive}`
            : undefined,
      },
    });

    await createAuditLog({
      action: "oauth_client_update",
      targetType: "oauth_client",
      targetId: id,
      // 只记录白名单字段，避免原始 body 中的敏感内容（如误粘贴的 secret）进入审计
      detail: { changes: sanitizeClientPatchForAudit(body), clientId: client.clientId },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({ success: true, data: { client: toSafeClientResponse(client) } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }
    apiConsole.error("[AdminOAuthClient PATCH] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
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
    if (!hasAdminPermission(admin, "sso:clients:write")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：SSO 客户端管理" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await context.params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const client = await getOAuthClientById(id);
    if (!client) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Client 不存在" } },
        { status: 404 }
      );
    }

    // 级联撤销：分页扫描活跃会话入队 backchannel 通知，再撤销 session/token。
    // 分页 + 队列化避免大 client 删除时无界查询与逐用户同步 HTTP。
    // 注意：撤销必须无条件执行（与是否配置/入队 backchannel 通知无关），
    // 否则未配置 backchannelLogoutUri 的 client 被删后，用户会话仍可继续使用。
    const enqueued = await enqueueBackchannelLogoutForActiveSessions({
      clientId: client.clientId,
    });
    await prisma.oAuthSession.updateMany({
      where: { clientId: client.clientId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await prisma.refreshToken.updateMany({
      where: { clientId: client.clientId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: "admin_revoke" },
    });
    // 已签发 access token 的即时失效由 sid 会话校验承担（verifyOAuthAccessToken 按
    // sid 查到 OAuthSession.revokedAt 即拒绝），不再逐用户拉黑 token，避免误登出主站会话。

    const deleted = await deleteOAuthClient(id);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Client 不存在或已删除" } },
        { status: 404 }
      );
    }

    // 响应后立即补投小批量（client 行已删除，投递使用 payload 中的 URI 快照）
    scheduleBackchannelRedelivery();

    // SSO 审计：client 生命周期变更（合规敏感，同步等待写入）
    await recordSsoEvent({
      event: "status_change",
      clientId: client.clientId,
      clientName: client.name,
      ip: getClientIP(request),
      success: true,
      detail: { action: "client_deleted", affectedUserCount: enqueued.userClientCount },
    });

    await createAuditLog({
      action: "oauth_client_delete",
      targetType: "oauth_client",
      targetId: id,
      detail: { clientId: client.clientId, name: client.name },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({ success: true, data: { message: "Client 已删除" } });
  } catch (error) {
    apiConsole.error("[AdminOAuthClient DELETE] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
