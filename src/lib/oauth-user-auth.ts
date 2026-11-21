/**
 * OAuth 用户资源端点鉴权骨架
 *
 * 在共享鉴权（CORS → 限流 → Bearer 验签 → 黑名单 → DPoP）基础上，
 * 追加资源端点统一要求：用户身份（拒绝 M2M）→ scope → 账户 ACTIVE。
 * 供积分/地址等"仅用户本人"的资源端点复用，避免各端点复制粘贴导致口径漂移。
 */
import type { NextRequest } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import {
  authenticateOAuthResourceRequest,
  buildBearerChallenge,
  isM2mPayload,
  type OAuthResJson,
} from "@/lib/oauth-resource-auth";
import { guardOAuthUserActive } from "@/lib/oauth-user-guard";
import { getConsentStatus } from "@/lib/consent-status";
import { oauthRouteRequiresConsent } from "@/lib/consent-route-policy";
import { scheduleSsoEvent } from "@/lib/sso-audit";
import type { OAuthAccessTokenPayload } from "@/types/auth";

export interface OAuthUserAuthOptions {
  scope: string;
  action: string;
  requireLegalConsent?: boolean;
}

export interface OAuthUserAuthOk {
  ok: true;
  payload: OAuthAccessTokenPayload;
  ip: string;
  resJson: OAuthResJson;
  /** 当前请求命中的 CORS 白名单头（供 decorateOAuthResponse 使用） */
  corsHeaders: Record<string, string>;
}

export type OAuthUserAuthResult = OAuthUserAuthOk | { ok: false; response: Response };

export async function authenticateOAuthUserRequest(
  request: NextRequest,
  method: string,
  options: OAuthUserAuthOptions
): Promise<OAuthUserAuthResult> {
  const auth = await authenticateOAuthResourceRequest(request, method);
  if (!auth.ok) return { ok: false, response: auth.response };

  const { payload, ip, resJson } = auth;
  // M2M（client_credentials）无用户身份：拒绝访问用户数据
  if (isM2mPayload(payload)) {
    scheduleSsoEvent({
      event: "userinfo",
      clientId: payload.client_id,
      ip,
      success: false,
      detail: { action: options.action, reason: "m2m_token" },
    });
    return {
      ok: false,
      response: resJson(
        { error: "invalid_request", error_description: "client_credentials token 无用户身份" },
        403
      ),
    };
  }

  const scopes = (payload.scope || "").split(" ").filter(Boolean);
  if (!scopes.includes(options.scope)) {
    scheduleSsoEvent({
      event: "userinfo",
      userId: payload.id,
      clientId: payload.client_id,
      ip,
      success: false,
      detail: { action: options.action, reason: "insufficient_scope" },
    });
    return {
      ok: false,
      response: resJson(
        { error: "insufficient_scope", error_description: `需要 ${options.scope} scope` },
        403,
        {
          "WWW-Authenticate": buildBearerChallenge(
            `error="insufficient_scope", scope="${options.scope}"`
          ),
        }
      ),
    };
  }

  const guard = await guardOAuthUserActive(payload.id);
  if (!guard.ok) {
    scheduleSsoEvent({
      event: "userinfo",
      userId: payload.id,
      clientId: payload.client_id,
      ip,
      success: false,
      detail: { action: options.action, reason: guard.reason },
    });
    return {
      ok: false,
      response: resJson(
        { error: guard.error, error_description: guard.errorDescription },
        guard.status
      ),
    };
  }

  const pathname = request.nextUrl?.pathname;
  const requireLegalConsent =
    options.requireLegalConsent ?? (pathname ? oauthRouteRequiresConsent(pathname) : true);
  if (requireLegalConsent) {
    const consent = await getConsentStatus(payload.id);
    if (consent.required) {
      scheduleSsoEvent({
        event: "userinfo",
        userId: payload.id,
        clientId: payload.client_id,
        ip,
        success: false,
        detail: { action: options.action, reason: "legal_consent_required" },
      });
      const base =
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.NEXT_PUBLIC_BASE_URL ||
        request.nextUrl.origin;
      const consentUrl = new URL("/consent", base);
      consentUrl.searchParams.set("return_to", "/");
      return {
        ok: false,
        response: resJson(
          {
            error: "consent_required",
            error_description: "需要先完成主站隐私政策和服务条款同意",
            consent_uri: consentUrl.toString(),
          },
          403
        ),
      };
    }
  }

  return { ok: true, payload, ip, resJson, corsHeaders: auth.corsHeaders };
}

/**
 * OAuth 资源端点的用户级限流。
 * 共享鉴权只有 IP 级限流（默认 600 次/分钟）；兑换/售后等写操作还需要
 * 与官网会话路由一致的按用户限流，避免单账号刷单或放大第三方调用。
 */
export async function checkOAuthUserRateLimit(
  userId: string,
  maxRequests: number
): Promise<boolean> {
  const result = await rateLimit(`user:${userId}`, "default", {
    maxRequests,
    windowMs: 60 * 1000,
  });
  return result.success;
}
