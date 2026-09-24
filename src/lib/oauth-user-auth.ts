/**
 * OAuth 用户资源端点鉴权骨架
 *
 * 在共享鉴权（CORS → 限流 → Bearer 验签 → 黑名单 → DPoP）基础上，
 * 追加资源端点统一要求：用户身份（拒绝 M2M）→ scope → 账户 ACTIVE。
 * 供积分/地址等"仅用户本人"的资源端点复用，避免各端点复制粘贴导致口径漂移。
 */
import type { NextRequest } from "next/server";
import {
  authenticateOAuthResourceRequest,
  isM2mPayload,
  type OAuthResJson,
} from "@/lib/oauth-resource-auth";
import { guardOAuthUserActive } from "@/lib/oauth-user-guard";
import { scheduleSsoEvent } from "@/lib/sso-audit";
import type { OAuthAccessTokenPayload } from "@/types/auth";

export interface OAuthUserAuthOk {
  ok: true;
  payload: OAuthAccessTokenPayload;
  ip: string;
  resJson: OAuthResJson;
}

export type OAuthUserAuthResult = OAuthUserAuthOk | { ok: false; response: Response };

export async function authenticateOAuthUserRequest(
  request: NextRequest,
  method: string,
  options: { scope: string; action: string }
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
        { "WWW-Authenticate": `Bearer error="insufficient_scope", scope="${options.scope}"` }
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

  return { ok: true, payload, ip, resJson };
}
