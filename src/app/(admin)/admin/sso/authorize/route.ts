import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/auth";
import { resolveAdvisorRole } from "@/lib/admin-permissions";
import {
  createAdminSsoCode,
  getAdminSsoConfig,
  isAdminSsoEnabled,
  isTotpSatisfied,
} from "@/lib/admin-sso";
import { prisma } from "@/lib/prisma";
import { beginAuditLog, createAuditLog, finishAuditLog } from "@/lib/audit";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { getIssuer } from "@/lib/oauth-constants";
import { logger } from "@/lib/logger";

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
// 主站管理员已登录 + 有测肤子站权限 + 满足 TOTP 要求后，签发一次性 code。
export async function GET(request: NextRequest) {
  if (!isAdminSsoEnabled()) {
    return badRequest("Admin SSO is disabled");
  }

  let config: ReturnType<typeof getAdminSsoConfig>;
  try {
    config = getAdminSsoConfig();
  } catch (error) {
    logger.error("[AdminSSO] 配置缺失", { error: String(error) });
    return badRequest("Admin SSO is not configured");
  }

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

  if (responseType !== "code") return badRequest("response_type must be code");
  if (clientId !== config.clientId) return badRequest("invalid client_id");
  if (redirectUri !== config.redirectUri) return badRequest("invalid redirect_uri");
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
  const advisorRole = resolveAdvisorRole(admin.role, admin.permissionOverrides);
  if (!advisorRole) {
    await createAuditLog({
      action: "admin_sso_denied",
      targetType: "admin",
      targetId: admin.id,
      detail: { reason: "no_advisor_access", clientId },
      adminId: admin.id,
      request,
    }).catch(() => {});
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
        clientId: config.clientId,
        redirectUri: config.redirectUri,
        advisorRole,
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
        clientId: config.clientId,
        redirectUri: config.redirectUri,
        codeChallenge,
        codeChallengeMethod,
        adminTokenVersion: adminSecurity.tokenVersion,
        mainSessionExp: exp,
      }));
    } catch (error) {
      await finishAuditLog(auditId, "FAILURE", { clientId: config.clientId });
      throw error;
    }

    await finishAuditLog(auditId, "SUCCESS", {
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      advisorRole,
    });

    const target = new URL(config.redirectUri);
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
