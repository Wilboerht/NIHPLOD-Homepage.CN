import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  consumeAdminSsoCode,
  getAdminSsoConfig,
  isAdminSsoEnabled,
  isTotpSatisfied,
  safeSecretEqual,
  signAdminSsoAssertion,
} from "@/lib/admin-sso";
import { resolveAdvisorRole } from "@/lib/admin-permissions";
import { verifyPKCE } from "@/lib/oauth-code";
import { prisma } from "@/lib/prisma";
import { beginAuditLog, createAuditLog, finishAuditLog } from "@/lib/audit";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const tokenSchema = z.object({
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
  code: z.string().min(1),
  redirect_uri: z.string().url(),
  code_verifier: z.string().min(43).max(128),
});

function jsonError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

async function parseBody(request: NextRequest): Promise<unknown> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    return Object.fromEntries(form.entries());
  }
  return request.json();
}

// POST /api/admin/sso/token
// 子站服务端用 client_secret + 一次性 code 换取 60 秒管理员断言。
export async function POST(request: NextRequest) {
  if (!isAdminSsoEnabled()) {
    return jsonError("NOT_FOUND", "Admin SSO is disabled", 404);
  }

  let config: ReturnType<typeof getAdminSsoConfig>;
  try {
    config = getAdminSsoConfig();
  } catch (error) {
    logger.error("[AdminSSO] 配置缺失", { error: String(error) });
    return jsonError("INTERNAL_ERROR", "Admin SSO is not configured", 500);
  }

  const ip = getClientIP(request);
  const limit = await rateLimit(`admin-sso-token-${ip}`, "default", {
    maxRequests: 30,
    windowMs: 60 * 1000,
  });
  if (!limit.success) {
    return jsonError("RATE_LIMITED", "请求过于频繁，请稍后再试", 429);
  }

  let parsed;
  try {
    parsed = tokenSchema.safeParse(await parseBody(request));
  } catch {
    return jsonError("INVALID_REQUEST", "请求格式错误", 400);
  }
  if (!parsed.success) {
    return jsonError("INVALID_REQUEST", "请求参数不完整", 400);
  }

  const { client_id, client_secret, code, redirect_uri, code_verifier } = parsed.data;

  if (client_id !== config.clientId || !safeSecretEqual(client_secret, config.clientSecret)) {
    await createAuditLog({
      action: "admin_sso_denied",
      targetType: "admin",
      detail: { reason: "invalid_client", clientId: client_id },
      request,
    }).catch(() => {});
    return jsonError("INVALID_CLIENT", "客户端认证失败", 401);
  }

  const consumed = await consumeAdminSsoCode(code);
  if (!consumed) {
    await createAuditLog({
      action: "admin_sso_denied",
      targetType: "admin",
      detail: { reason: "invalid_or_expired_code", clientId: client_id },
      request,
    }).catch(() => {});
    return jsonError("INVALID_GRANT", "授权码无效或已过期", 400);
  }

  const deny = async (reason: string, message: string, status = 400) => {
    await createAuditLog({
      action: "admin_sso_denied",
      targetType: "admin",
      targetId: consumed.adminId,
      detail: { reason, clientId: client_id },
      adminId: consumed.adminId,
      request,
    }).catch(() => {});
    return jsonError("INVALID_GRANT", message, status);
  };

  if (consumed.clientId !== client_id) {
    return deny("client_mismatch", "授权码与客户端不匹配");
  }
  if (consumed.redirectUri !== redirect_uri) {
    return deny("redirect_uri_mismatch", "redirect_uri 不匹配");
  }
  if (
    !consumed.codeChallenge ||
    !verifyPKCE(code_verifier, consumed.codeChallenge, consumed.codeChallengeMethod || "S256")
  ) {
    return deny("pkce_mismatch", "PKCE 校验失败");
  }
  if (consumed.mainSessionExp * 1000 <= Date.now()) {
    return deny("main_session_expired", "主站登录已过期，请重新登录", 401);
  }

  const admin = await prisma.admin.findUnique({
    where: { id: consumed.adminId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      permissions: true,
      tokenVersion: true,
      status: true,
      deletedAt: true,
      totpEnabled: true,
    },
  });

  if (!admin || admin.deletedAt || admin.status !== "ACTIVE") {
    return deny("admin_inactive", "管理员账号不可用", 401);
  }
  if (admin.tokenVersion !== consumed.adminTokenVersion) {
    return deny("token_version_changed", "管理员会话已变更，请重新登录", 401);
  }

  const advisorRole = resolveAdvisorRole(admin.role, admin.permissions);
  if (!advisorRole) {
    return deny("no_advisor_access", "无测肤子站访问权限", 403);
  }
  if (!isTotpSatisfied(admin.totpEnabled)) {
    return deny("totp_required", "请先开启二次验证", 403);
  }

  try {
    const auditId = await beginAuditLog({
      action: "admin_sso_token",
      targetType: "admin",
      targetId: admin.id,
      detail: {
        clientId: config.clientId,
        advisorRole,
        totpEnabled: admin.totpEnabled,
      },
      actorType: "ADMIN",
      actorEmail: admin.email,
      actorName: admin.name,
      actorRole: admin.role,
      authMethod: "totp",
      adminId: admin.id,
      request,
    });
    if (!auditId) {
      return jsonError("AUDIT_UNAVAILABLE", "审计服务不可用，已拒绝签发", 503);
    }

    let assertion: string;
    try {
      assertion = await signAdminSsoAssertion(
        {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
          permissionOverrides: admin.permissions,
          tokenVersion: admin.tokenVersion,
          totpEnabled: admin.totpEnabled,
          mainSessionExp: consumed.mainSessionExp,
        },
        config
      );
    } catch (error) {
      await finishAuditLog(auditId, "FAILURE", { clientId: config.clientId });
      throw error;
    }

    await finishAuditLog(auditId, "SUCCESS", {
      clientId: config.clientId,
      advisorRole,
      totpEnabled: admin.totpEnabled,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          assertion,
          expires_in: 60,
        },
      },
      { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } }
    );
  } catch (error) {
    logger.error("[AdminSSO] token exchange failed", { error: String(error) });
    return jsonError("INTERNAL_ERROR", "签发管理员断言失败", 500);
  }
}
