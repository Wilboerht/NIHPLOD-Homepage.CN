import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/auth";
import { getAdminSsoClient, resolveClientRole } from "@/lib/admin-sso-clients";
import {
  createAdminSsoCode,
  isTotpSatisfied,
} from "@/lib/admin-sso";
import { prisma } from "@/lib/prisma";
import { beginAuditLog, createAuditLog, finishAuditLog } from "@/lib/audit";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { getIssuer } from "@/lib/oauth-constants";
import { logger } from "@/lib/logger";
import { recordSsoEvent } from "@/lib/sso-audit";

export const dynamic = "force-dynamic";

const STATE_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;
const PKCE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function badRequest(message: string): NextResponse {
  return NextResponse.json(
    { success: false, error: { code: "INVALID_REQUEST", message } },
    { status: 400, headers: { "Cache-Control": "no-store" } }
  );
}

function redirectToDenied(reason: string): NextResponse {
  const url = new URL("/admin/sso/denied", getIssuer());
  url.searchParams.set("reason", reason);
  return NextResponse.redirect(url);
}

// GET /admin/sso/authorize
// 主站管理员已登录 + 有目标客户端权限 + 满足 TOTP 要求后，签发一次性 code。
export async function GET(request: NextRequest) {
  const ip = getClientIP(request);
  const limit = await rateLimit(`admin-sso-authorize-${ip}`, "default", {
    maxRequests: 30,
    windowMs: 60 * 1000,
  });
  if (!limit.success) {
    return NextResponse.json(
      { success: false, error: { code: "RATE_LIMITED", message: "请求过于频繁，请稍后再试" } },
      { status: 429, headers: { "Cache-Control": "no-store" } }
    );
  }

  const params = request.nextUrl.searchParams;
  const responseType = params.get("response_type");
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const state = params.get("state");
  const codeChallenge = params.get("code_challenge");
  const codeChallengeMethod = params.get("code_challenge_method");

  const client = (() => {
    try {
      return getAdminSsoClient(clientId);
    } catch (error) {
      logger.error("[AdminSSO] 配置缺失", { error: String(error) });
      return null;
    }
  })();
  if (!client) {
    return badRequest("Admin SSO is disabled or invalid client_id");
  }

  if (responseType !== "code") return badRequest("response_type must be code");
  if (redirectUri !== client.redirectUri) return badRequest("invalid redirect_uri");
  if (!state || !STATE_PATTERN.test(state)) return badRequest("invalid state");
  if (!codeChallenge || !PKCE_CHALLENGE_PATTERN.test(codeChallenge)) {
    return badRequest("invalid code_challenge");
  }
  if (codeChallengeMethod !== "S256") {
    return badRequest("code_challenge_method must be S256");
  }

  const session = await getCurrentAdminSession();
  if (!session) {
    const loginUrl = new URL("/admin-login", getIssuer());
    loginUrl.searchParams.set("reauth", "1");
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  const { admin, exp } = session;
  const clientRole = resolveClientRole(client, admin.role, admin.permissionOverrides);
  if (!clientRole) {
    await createAuditLog({
      action: "admin_sso_denied",
      targetType: "admin",
      targetId: admin.id,
      detail: { reason: "no_client_access", clientId: client.clientId },
      adminId: admin.id,
      request,
    }).catch(() => {});
    void recordSsoEvent({
      event: "authorize",
      userId: admin.id,
      clientId: client.clientId,
      clientName: client.name,
      ip: getClientIP(request),
      success: false,
      detail: { admin_sso: true, reason: "no_client_access" },
    });
    return redirectToDenied("forbidden");
  }

  const adminSecurity = await prisma.admin.findUnique({
    where: { id: admin.id },
    select: { totpEnabled: true, tokenVersion: true },
  });
  if (!adminSecurity) {
    return redirectToDenied("not_found");
  }

  if (!isTotpSatisfied(adminSecurity.totpEnabled)) {
    const totpUrl = new URL("/admin/settings/totp", getIssuer());
    totpUrl.searchParams.set("return_to", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(totpUrl);
  }

  try {
    const auditId = await beginAuditLog({
      action: "admin_sso_authorize",
      targetType: "admin",
      targetId: admin.id,
      detail: {
        clientId: client.clientId,
        redirectUri: client.redirectUri,
        clientRole,
        advisorRole: client.roleResolver === "advisor" ? clientRole : undefined,
        baRole: client.roleResolver === "ba" ? clientRole : undefined,
        totpEnabled: adminSecurity.totpEnabled,
        ip: getClientIP(request),
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
      return NextResponse.json(
        {
          success: false,
          error: { code: "AUDIT_UNAVAILABLE", message: "审计服务不可用，已拒绝操作" },
        },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    let code: string;
    try {
      ({ code } = await createAdminSsoCode({
        adminId: admin.id,
        clientId: client.clientId,
        redirectUri: client.redirectUri,
        codeChallenge,
        codeChallengeMethod,
        adminTokenVersion: adminSecurity.tokenVersion,
        mainSessionExp: exp,
      }));
    } catch (error) {
      await finishAuditLog(auditId, "FAILURE", { clientId: client.clientId });
      throw error;
    }

    await finishAuditLog(auditId, "SUCCESS", {
      clientId: client.clientId,
      redirectUri: client.redirectUri,
      clientRole,
    });
    void recordSsoEvent({
      event: "authorize",
      userId: admin.id,
      clientId: client.clientId,
      clientName: client.name,
      ip: getClientIP(request),
      success: true,
      detail: { admin_sso: true, clientRole },
    });

    const target = new URL(client.redirectUri);
    target.searchParams.set("code", code);
    target.searchParams.set("state", state);
    return NextResponse.redirect(target, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    logger.error("[AdminSSO] authorize failed", { error: String(error) });
    return redirectToDenied("server_error");
  }
}
