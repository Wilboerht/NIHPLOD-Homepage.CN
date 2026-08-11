/**
 * App Router 登出 Route Handler
 *
 * 在 /api/auth/logout 路由中处理本地登出 + RP-Initiated Logout：
 * 1. 从 cookie 读取 refresh_token 并调用 revocation_endpoint 撤销
 * 2. 清除所有 SSO cookie
 * 3. 可选重定向到 SSO 中心登出页
 *
 * 用法 (src/app/api/auth/logout/route.ts):
 * ```ts
 * import { createLogoutRouteHandler } from "@nihplod/sso-sdk/next";
 *
 * const handler = createLogoutRouteHandler({
 *   clientId: "my-app",
 *   clientSecret: "optional-secret",
 *   ssoBaseUrl: "https://nihplod.cn",
 *   redirectUri: "https://myapp.com/api/auth/callback",
 *   postLogoutRedirectUri: "https://myapp.com/",
 * });
 *
 * // 推荐使用 POST 触发登出（防登出 CSRF），GET 保留用于兼容 <a> 标签跳转
 * export const GET = handler;
 * export const POST = handler;
 * ```
 */

import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_ACCESS_TOKEN_COOKIE_NAME,
  DEFAULT_REFRESH_TOKEN_COOKIE_NAME,
  DEFAULT_ID_TOKEN_COOKIE_NAME,
  DEFAULT_STATE_COOKIE_NAME,
  DEFAULT_RETURN_COOKIE_NAME,
  DEFAULT_VERIFIER_COOKIE_NAME,
  DEFAULT_LOGOUT_STATE_COOKIE_NAME,
  getHostCookieOptions,
  getSecureCookieOptions,
} from "./constants";

// ============================================
// 类型定义
// ============================================

export interface LogoutRouteConfig {
  /** OAuth Client ID */
  clientId: string;

  /** SSO 中心地址 */
  ssoBaseUrl: string;

  /** 回调 URL（与注册 redirect_uri 一致，用于构造 post_logout_redirect_uri） */
  redirectUri: string;

  /**
   * OAuth Client Secret（可选）。
   * 撤销 refresh_token 时，Confidential Client 需要认证。
   */
  clientSecret?: string;

  /** 登出后跳转回子项目的地址，默认取 redirectUri 的 origin */
  postLogoutRedirectUri?: string;

  /** 是否重定向到 SSO 中心登出页，默认 true */
  redirectToSso?: boolean;

  /** Access Token Cookie 名称 */
  accessTokenCookieName?: string;

  /** Refresh Token Cookie 名称 */
  refreshTokenCookieName?: string;

  /** ID Token Cookie 名称，默认 __Host-nihplod_sso_id */
  idTokenCookieName?: string;

  /** State Cookie 名称 */
  stateCookieName?: string;

  /** Return URL Cookie 名称 */
  returnUrlCookieName?: string;

  /** PKCE Verifier Cookie 名称 */
  verifierCookieName?: string;

  /** 回调路径（用于清除 verifier cookie），默认 "/api/auth/callback" */
  callbackPath?: string;

  /** Logout State Cookie 名称（RP-Initiated Logout CSRF 防护），默认 __Host-nihplod_sso_logout_state */
  logoutStateCookieName?: string;
}

interface OidcDiscovery {
  issuer: string;
  end_session_endpoint?: string;
  revocation_endpoint?: string;
  [key: string]: unknown;
}

// ============================================
// 工具函数
// ============================================

async function fetchDiscovery(ssoBaseUrl: string): Promise<OidcDiscovery | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(
      `${ssoBaseUrl}/api/oauth/.well-known/openid-configuration`,
      { signal: controller.signal }
    );
    if (!res.ok) return null;
    return (await res.json()) as OidcDiscovery;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** 生成安全随机字符串（用于 logout state，Node/Edge Runtime 均支持 Web Crypto） */
function generateRandomString(length: number): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const maxValid = Math.floor(256 / chars.length) * chars.length;
  let result = "";
  while (result.length < length) {
    const array = new Uint8Array(length * 2);
    crypto.getRandomValues(array);
    for (let i = 0; i < array.length && result.length < length; i++) {
      if (array[i] >= maxValid) continue;
      result += chars[array[i] % chars.length];
    }
  }
  return result;
}

// ============================================
// Route Handler 工厂函数
// ============================================

export function createLogoutRouteHandler(config: LogoutRouteConfig) {
  const {
    clientId,
    ssoBaseUrl,
    redirectUri,
    clientSecret,
    postLogoutRedirectUri = new URL(redirectUri).origin + "/",
    redirectToSso = true,
    accessTokenCookieName = DEFAULT_ACCESS_TOKEN_COOKIE_NAME,
    refreshTokenCookieName = DEFAULT_REFRESH_TOKEN_COOKIE_NAME,
    idTokenCookieName = DEFAULT_ID_TOKEN_COOKIE_NAME,
    stateCookieName = DEFAULT_STATE_COOKIE_NAME,
    returnUrlCookieName = DEFAULT_RETURN_COOKIE_NAME,
    verifierCookieName = DEFAULT_VERIFIER_COOKIE_NAME,
    callbackPath = "/api/auth/callback",
    logoutStateCookieName = DEFAULT_LOGOUT_STATE_COOKIE_NAME,
  } = config;

  const normalizedBase = ssoBaseUrl.replace(/\/+$/, "");

  /**
   * 登出 handler：同时适配 GET 与 POST（函数本身不区分 method，
   * 在 route.ts 中 `export const GET = handler; export const POST = handler;` 即可）。
   *
   * ⚠️ CSRF 注意：GET 请求可被跨站触发（如 `<img src="/api/auth/logout">`）。
   * 推荐做法：在 UI 层使用 POST（fetch/form）触发登出；
   * GET 方法保留仅为兼容 <a> 标签跳转与 RP-Initiated Logout 回跳。
   *
   * 当请求携带 state 参数时，视为 RP-Initiated Logout 的回跳（post_logout_redirect_uri
   * 指向本路由的场景），校验 logout state cookie 后放行，防止伪造回跳。
   */
  return async function handler(request: NextRequest) {
    // RP-Initiated Logout 回跳：校验 state（CSRF 防护）
    const returnedState = request.nextUrl.searchParams.get("state");
    if (returnedState) {
      const savedState = request.cookies.get(logoutStateCookieName)?.value;
      if (!savedState || savedState !== returnedState) {
        return NextResponse.json(
          { error: "invalid_request", error_description: "Logout state 不匹配" },
          { status: 400 }
        );
      }
      const res = NextResponse.redirect(request.nextUrl.origin + "/");
      res.cookies.set(logoutStateCookieName, "", getHostCookieOptions(0));
      return res;
    }

    const refreshToken = request.cookies.get(refreshTokenCookieName)?.value;
    const idTokenHint = request.cookies.get(idTokenCookieName)?.value;

    // 1. best-effort 撤销服务端 refresh_token
    if (refreshToken) {
      try {
        const discovery = await fetchDiscovery(normalizedBase);
        const revokeUrl =
          discovery?.revocation_endpoint || `${normalizedBase}/api/oauth/revoke`;
        const body = new URLSearchParams({
          token: refreshToken,
          token_type_hint: "refresh_token",
          client_id: clientId,
        });
        if (clientSecret) {
          body.set("client_secret", clientSecret);
        }
        await fetch(revokeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        });
      } catch {
        // 撤销失败不影响本地登出
      }
    }

    // 2. 准备本地清除 SSO cookie 的响应
    const clearCookies = (res: NextResponse) => {
      res.cookies.set(accessTokenCookieName, "", getHostCookieOptions(0));
      res.cookies.set(refreshTokenCookieName, "", getHostCookieOptions(0));
      res.cookies.set(idTokenCookieName, "", getHostCookieOptions(0));
      res.cookies.set(stateCookieName, "", getHostCookieOptions(0));
      res.cookies.set(returnUrlCookieName, "", getHostCookieOptions(0));
      res.cookies.set(verifierCookieName, "", getSecureCookieOptions(0, "/"));
      res.cookies.set(verifierCookieName, "", getSecureCookieOptions(0, callbackPath));
      return res;
    };

    // 3. 若需要 RP-Initiated Logout，重定向到 SSO 中心，同时必须清除本地 Cookie
    if (redirectToSso) {
      const discovery = await fetchDiscovery(normalizedBase);
      const endSessionEndpoint =
        discovery?.end_session_endpoint || `${normalizedBase}/logout`;
      const logoutUrl = new URL(endSessionEndpoint);
      logoutUrl.searchParams.set("client_id", clientId);
      logoutUrl.searchParams.set(
        "post_logout_redirect_uri",
        postLogoutRedirectUri
      );
      if (idTokenHint) {
        logoutUrl.searchParams.set("id_token_hint", idTokenHint);
      }
      // 携带 state 防登出 CSRF：回跳时校验（见 handler 开头）
      const logoutState = generateRandomString(32);
      logoutUrl.searchParams.set("state", logoutState);
      const res = clearCookies(NextResponse.redirect(logoutUrl.toString()));
      res.cookies.set(logoutStateCookieName, logoutState, getHostCookieOptions(600));
      return res;
    }

    return clearCookies(
      NextResponse.redirect(request.nextUrl.origin + "/")
    );
  };
}
