/**
 * OAuth 资源端点共享鉴权
 *
 * userinfo（GET/PATCH）、membership 等 Bearer token 保护的资源端点共用的
 * 鉴权骨架：CORS → 限流 → Bearer 提取 → token 验证 → 黑名单 → DPoP 绑定验证。
 * 集中管理避免各端点复制粘贴导致的安全检查遗漏。
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyOAuthAccessToken } from "@/lib/jwt";
import { isTokenBlacklisted } from "@/lib/token-blacklist";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { scheduleSsoEvent } from "@/lib/sso-audit";
import { validateDPoPProof, computeDPoPAth, dpopNonceHeader, getDPoPHtu } from "@/lib/dpop";
import type { OAuthAccessTokenPayload } from "@/types/auth";

/**
 * 响应工厂：统一 no-store + CORS 头。
 * 与 token/revoke 端点一致：资源端点响应含用户数据，不得被缓存。
 */
export type OAuthResJson = (
  body: unknown,
  status?: number,
  extraHeaders?: Record<string, string>
) => NextResponse;

export interface OAuthResourceAuthOk {
  ok: true;
  payload: OAuthAccessTokenPayload;
  ip: string;
  resJson: OAuthResJson;
}

export type OAuthResourceAuthResult =
  | OAuthResourceAuthOk
  | { ok: false; response: NextResponse };

/**
 * 共享鉴权流程。失败时返回可直接返回给客户端的响应（审计已写入）；
 * 成功时返回 token payload、客户端 IP 与响应工厂。
 *
 * @param method - DPoP proof 校验用的 HTTP 方法（htm 声明，需与实际请求方法一致）
 */
export async function authenticateOAuthResourceRequest(
  request: NextRequest,
  method: string
): Promise<OAuthResourceAuthResult> {
  const ip = getClientIP(request);
  const corsHeaders = await getOAuthCorsHeaders(request);
  const resJson: OAuthResJson = (body, status = 200, extraHeaders) =>
    NextResponse.json(body, {
      status,
      headers: { "Cache-Control": "no-store", Pragma: "no-cache", ...corsHeaders, ...extraHeaders },
    });

  // 限流
  const limitResult = await rateLimit(ip, "oauth-userinfo");
  if (!limitResult.success) {
    return {
      ok: false,
      response: resJson({ error: "rate_limited", error_description: "请求过于频繁" }, 429),
    };
  }

  // 从 Authorization header 提取 token
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      ok: false,
      response: resJson(
        { error: "invalid_token", error_description: "缺少 Authorization header" },
        401,
        { "WWW-Authenticate": 'Bearer error="invalid_token"' }
      ),
    };
  }

  const token = authHeader.slice(7);

  // 验证 access token（不限制 audience：OAuth 2.0 Bearer Token 模式中 token 即凭证，
  //   资源端点不进行 client 认证。通过 DPoP token binding 防止 token 被盗后在不同 client 重用）
  const payload = await verifyOAuthAccessToken(token);
  if (!payload) {
    scheduleSsoEvent({
      event: "userinfo",
      ip,
      success: false,
      detail: { reason: "invalid_token" },
    });
    return {
      ok: false,
      response: resJson(
        { error: "invalid_token", error_description: "Access token 无效或已过期" },
        401,
        { "WWW-Authenticate": 'Bearer error="invalid_token"' }
      ),
    };
  }

  // 检查 access token 黑名单（封禁后 15 分钟窗口期内的 token）
  const blacklisted = await isTokenBlacklisted(payload.id);
  if (blacklisted) {
    scheduleSsoEvent({
      event: "userinfo",
      userId: payload.id,
      clientId: payload.client_id,
      ip,
      success: false,
      detail: { reason: "blacklisted", blacklistReason: blacklisted.reason },
    });
    return {
      ok: false,
      response: resJson({ error: "account_disabled", error_description: "账户已被限制" }, 403, {
        "WWW-Authenticate": 'Bearer error="account_disabled", error_description="Account disabled"',
      }),
    };
  }

  // DPoP 绑定验证：若 token 包含 cnf.jkt，请求必须携带有效的 DPoP proof
  const dpopHeader = request.headers.get("DPoP");
  const tokenCnf = (payload as Record<string, unknown>).cnf as { jkt?: string } | undefined;
  if (tokenCnf?.jkt) {
    if (!dpopHeader) {
      return {
        ok: false,
        response: resJson(
          { error: "invalid_dpop_proof", error_description: "此 token 需要 DPoP proof" },
          401,
          { "WWW-Authenticate": 'Bearer error="invalid_token"' }
        ),
      };
    }
    const ath = computeDPoPAth(token);
    // htu 基于公网 origin（反向代理后 request.url 可能是内网地址），path 区分大小写
    const htu = getDPoPHtu(request);
    const dpopResult = await validateDPoPProof(
      dpopHeader,
      method,
      htu,
      ath,
      undefined,
      `${payload.client_id}:${payload.id}`
    );
    if (!dpopResult.valid) {
      const errorHeaders: Record<string, string> = {
        "WWW-Authenticate": `Bearer error="invalid_token", error_description="${dpopResult.errorDescription}"`,
      };
      if (dpopResult.newNonce) {
        Object.assign(errorHeaders, dpopNonceHeader(dpopResult.newNonce));
      }
      return {
        ok: false,
        response: NextResponse.json(
          { error: dpopResult.error, error_description: dpopResult.errorDescription },
          { status: 401, headers: { ...corsHeaders, ...errorHeaders } }
        ),
      };
    }
    if (dpopResult.jkt !== tokenCnf.jkt) {
      return {
        ok: false,
        response: resJson(
          { error: "invalid_dpop_proof", error_description: "DPoP 密钥与 token 绑定的密钥不匹配" },
          401,
          { "WWW-Authenticate": 'Bearer error="invalid_token"' }
        ),
      };
    }
  }

  return { ok: true, payload, ip, resJson };
}

/**
 * M2M token（client_credentials grant）判定：无用户身份。
 * 优先按显式 client_type claim 识别，兼容旧 token 的 client: 前缀。
 */
export function isM2mPayload(payload: OAuthAccessTokenPayload): boolean {
  return (
    (payload as { client_type?: string }).client_type === "m2m" ||
    payload.id.startsWith("client:")
  );
}
