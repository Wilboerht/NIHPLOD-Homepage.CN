/**
 * App Router Refresh Route Handler
 *
 * 使用 httpOnly refresh cookie 在服务端换取新的 access/refresh/id token，
 * 并更新 Cookie。适用于 Next.js BFF/Confidential Client：token 不暴露给浏览器 JS。
 *
 * 用法 (src/app/api/auth/refresh/route.ts):
 * ```ts
 * import { createRefreshRouteHandler } from "@nihplod/sso-sdk/next";
 *
 * export const POST = createRefreshRouteHandler({
 *   clientId: process.env.SSO_CLIENT_ID!,
 *   clientSecret: process.env.SSO_CLIENT_SECRET,
 *   ssoBaseUrl: "https://nihplod.cn",
 *   redirectUri: "https://myapp.com/api/auth/callback",
 * });
 * ```
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchWithTimeout } from "../core/http";
import { validateIdToken } from "../core/id-token";
import {
  DEFAULT_ACCESS_TOKEN_COOKIE_NAME,
  DEFAULT_REFRESH_TOKEN_COOKIE_NAME,
  DEFAULT_ID_TOKEN_COOKIE_NAME,
  getHostCookieOptions,
  resolveInsecureLocalDev,
  toInsecureCookieName,
} from "./constants";

export interface RefreshRouteConfig {
  /** OAuth Client ID */
  clientId: string;

  /** SSO 中心地址 */
  ssoBaseUrl: string;

  /** 回调 URL（用于同源校验，必须与注册的 redirect_uri 一致） */
  redirectUri: string;

  /** OAuth Client Secret（Confidential Client 必填） */
  clientSecret?: string;

  /** Access Token Cookie 名称，默认 __Host-nihplod_sso_at */
  accessTokenCookieName?: string;

  /** Refresh Token Cookie 名称，默认 __Host-nihplod_sso_rt */
  refreshTokenCookieName?: string;

  /** ID Token Cookie 名称，默认 __Host-nihplod_sso_id */
  idTokenCookieName?: string;

  /**
   * 本地 HTTP 开发模式（默认 false）。必须与 middleware / callback / logout 配置一致。
   * 生产环境（NODE_ENV=production 且 ssoBaseUrl 为 https）下会被强制忽略并告警。
   */
  insecureLocalDev?: boolean;

  /**
   * 服务端到服务端调用的内网地址（可选，如 http://127.0.0.1:3000）。
   * 仅用于 token 交换；浏览器跳转仍使用 ssoBaseUrl 公网地址。
   */
  serverBaseUrl?: string;

  /** 调试日志开关（默认 false） */
  debug?: boolean;
}

function noStoreJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
  });
}

function clearAuthCookies(
  response: NextResponse,
  names: { access: string; refresh: string; idToken: string },
  secureCookies: boolean
): NextResponse {
  response.cookies.set(names.access, "", getHostCookieOptions(0, secureCookies));
  response.cookies.set(names.refresh, "", getHostCookieOptions(0, secureCookies));
  response.cookies.set(names.idToken, "", getHostCookieOptions(0, secureCookies));
  return response;
}

export function createRefreshRouteHandler(config: RefreshRouteConfig) {
  const {
    clientId,
    ssoBaseUrl,
    redirectUri,
    clientSecret,
    insecureLocalDev: insecureLocalDevOpt = false,
    debug = false,
  } = config;

  const insecureLocalDev = resolveInsecureLocalDev(insecureLocalDevOpt, ssoBaseUrl);
  const secureCookies = !insecureLocalDev;
  const pickName = (explicit: string | undefined, fallback: string) =>
    insecureLocalDev ? toInsecureCookieName(explicit ?? fallback) : (explicit ?? fallback);

  const accessTokenCookieName = pickName(
    config.accessTokenCookieName,
    DEFAULT_ACCESS_TOKEN_COOKIE_NAME
  );
  const refreshTokenCookieName = pickName(
    config.refreshTokenCookieName,
    DEFAULT_REFRESH_TOKEN_COOKIE_NAME
  );
  const idTokenCookieName = pickName(config.idTokenCookieName, DEFAULT_ID_TOKEN_COOKIE_NAME);

  const normalizedBase = ssoBaseUrl.replace(/\/+$/, "");
  const normalizedServerBase = (config.serverBaseUrl ?? ssoBaseUrl).replace(/\/+$/, "");
  const callbackOrigin = new URL(redirectUri).origin;
  const cookieNames = {
    access: accessTokenCookieName,
    refresh: refreshTokenCookieName,
    idToken: idTokenCookieName,
  };

  return async function POST(request: NextRequest): Promise<NextResponse> {
    // 刷新是写 Cookie 的敏感操作：仅允许同源发起，防跨站强制刷新（CSRF）。
    const requestOrigin = request.headers.get("origin");
    if (requestOrigin && requestOrigin !== callbackOrigin) {
      return noStoreJson({ error: "forbidden", error_description: "跨站请求被拒绝" }, 403);
    }
    const secFetchSite = request.headers.get("sec-fetch-site");
    if (
      !requestOrigin &&
      (!secFetchSite || (secFetchSite !== "same-origin" && secFetchSite !== "none"))
    ) {
      return noStoreJson({ error: "forbidden", error_description: "缺少同源请求证明" }, 403);
    }

    const refreshToken = request.cookies.get(refreshTokenCookieName)?.value;
    if (!refreshToken) {
      return noStoreJson({ error: "no_refresh_token", error_description: "缺少 refresh_token" }, 401);
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
    });
    if (clientSecret) body.set("client_secret", clientSecret);

    let res: Response | null = null;
    let lastError: unknown;
    try {
      res = await fetchWithTimeout(
        `${normalizedServerBase}/api/oauth/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        },
        10_000
      );
    } catch (err) {
      lastError = err;
    }

    if (lastError || !res) {
      if (debug) console.warn("[SSO SDK] refresh: token 请求失败", lastError);
      return noStoreJson(
        { error: "server_error", error_description: "刷新服务暂时不可用" },
        502
      );
    }

    let data: {
      access_token?: string;
      token_type?: string;
      expires_in?: number;
      refresh_token?: string;
      refresh_expires_in?: number;
      id_token?: string;
      error?: string;
      error_description?: string;
    } = {};
    try {
      data = (await res.json()) as typeof data;
    } catch {
      // 网关返回 HTML/空体等
    }

    if (!res.ok) {
      const error = typeof data.error === "string" ? data.error : "";
      // 限流/上游故障可重试：保留 Cookie，不要误判为登录态失效
      const status = res.status === 429 ? 429 : res.status >= 500 ? 502 : 401;
      const response = noStoreJson(
        {
          error: error || "refresh_failed",
          error_description: data.error_description || "刷新登录态失败，请重新登录",
        },
        status
      );
      // invalid_grant / invalid_client 等不可恢复：清除本地 Cookie，避免无限重试
      if (res.status === 400 || res.status === 401) {
        return clearAuthCookies(response, cookieNames, secureCookies);
      }
      return response;
    }

    if (
      !data.access_token ||
      typeof data.expires_in !== "number" ||
      !Number.isFinite(data.expires_in) ||
      data.expires_in <= 0
    ) {
      return clearAuthCookies(
        noStoreJson({ error: "server_error", error_description: "刷新响应不完整" }, 502),
        cookieNames,
        secureCookies
      );
    }

    // OIDC：refresh 响应若包含 ID Token，必须在写入 Cookie 前验签；
    // 按 OIDC Core §12.2，refresh 签发的 ID Token 不应携带 nonce。
    if (data.id_token) {
      try {
        await validateIdToken(
          data.id_token,
          data.access_token,
          normalizedBase,
          clientId
        );
      } catch (err) {
        if (debug) console.warn("[SSO SDK] refresh: ID Token 校验失败", err);
        return clearAuthCookies(
          noStoreJson({ error: "id_token_invalid", error_description: "登录校验失败" }, 401),
          cookieNames,
          secureCookies
        );
      }
    }

    const response = noStoreJson({ success: true, expires_in: data.expires_in });
    response.cookies.set(accessTokenCookieName, data.access_token, {
      ...getHostCookieOptions(data.expires_in, secureCookies),
    });
    response.cookies.set(refreshTokenCookieName, data.refresh_token || refreshToken, {
      ...getHostCookieOptions(
        typeof data.refresh_expires_in === "number" && data.refresh_expires_in > 0
          ? data.refresh_expires_in
          : 30 * 24 * 60 * 60,
        secureCookies
      ),
    });
    if (data.id_token) {
      let idTokenMaxAge = 3600;
      try {
        const payload = JSON.parse(
          Buffer.from(data.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
            "utf8"
          )
        ) as { exp?: number };
        if (typeof payload.exp === "number") {
          idTokenMaxAge = payload.exp - Math.floor(Date.now() / 1000);
        }
      } catch {
        // 解码失败使用默认值
      }
      if (idTokenMaxAge > 0) {
        response.cookies.set(idTokenCookieName, data.id_token, {
          ...getHostCookieOptions(idTokenMaxAge, secureCookies),
        });
      }
    }

    return response;
  };
}
