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
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { recordSsoEvent } from "@/lib/sso-audit";
import { getClientIP } from "@/lib/ratelimit";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { requireAdminStepUp } from "@/lib/admin-totp";
import { prisma } from "@/lib/prisma";
import {
  enqueueBackchannelLogoutForActiveSessions,
  scheduleBackchannelRedelivery,
} from "@/lib/backchannel-logout";

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

      const stepUpResponse = await requireAdminStepUp(request, admin);
      if (stepUpResponse) return stepUpResponse;

      const { id } = await context.params;
      if (!validateCUID(id)) {
        return invalidIdResponse();
      }

      const body = await request.json();

      const previousClient = await getOAuthClientById(id);
      if (!previousClient) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Client 不存在" } },
          { status: 404 }
        );
      }

      const auditId = await beginAuditLog({
      action: "oauth_client_update",
      targetType: "oauth_client",
      targetId: id,
      detail: { changes: sanitizeClientPatchForAudit(body) },
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

    const client = await updateOAuthClient(id, body);

    if (!client) {
      await finishAuditLog(auditId, "FAILURE", { code: "NOT_FOUND" });
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Client 不存在" } },
        { status: 404 }
      );
    }

    // scope 缩权：updateOAuthClient 已在事务内撤销该 client 全部 session/refresh token
    // 并收窄 consent；这里立即补投 backchannel，避免等待 cron 周期。
    if (client.scopesChanged) {
      scheduleBackchannelRedelivery();
    }

    // 停用：updateOAuthClient 已在同一事务内撤销全部 session/refresh token 并入队 backchannel；
    // 这里只触发响应后补投，避免二次撤销与错误被吞掉。
    if (previousClient.isActive && client.isActive === false) {
      scheduleBackchannelRedelivery();
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

    await finishAuditLog(auditId, "SUCCESS", {
      changes: sanitizeClientPatchForAudit(body),
      clientId: client.clientId,
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

    const stepUpResponse = await requireAdminStepUp(request, admin);
    if (stepUpResponse) return stepUpResponse;

    const client = await getOAuthClientById(id);
    if (!client) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Client 不存在" } },
        { status: 404 }
      );
    }

    const auditId = await beginAuditLog({
      action: "oauth_client_delete",
      targetType: "oauth_client",
      targetId: id,
      detail: { clientId: client.clientId, name: client.name },
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
      await finishAuditLog(auditId, "FAILURE", { code: "NOT_FOUND" });
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

    await finishAuditLog(auditId, "SUCCESS", {
      clientId: client.clientId,
      name: client.name,
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
