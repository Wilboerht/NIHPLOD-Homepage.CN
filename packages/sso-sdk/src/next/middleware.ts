/**
 * Next.js Middleware 辅助函数
 *
 * 在 Edge Runtime 中运行，自动检测未认证请求并重定向到 SSO 登录页。
 *
 * ⚠️ Edge Runtime 限制：
 * - 不能使用 Node.js crypto 模块
 * - PKCE code_challenge 使用 Web Crypto API 的 crypto.subtle.digest(SHA-256)
 *   （Edge Runtime 18+ 完全支持此 API）
 *
 * 用法 (src/middleware.ts):
 * ```ts
 * import { createSsoMiddleware } from "@nihplod/sso-sdk/next";
 *
 * export const middleware = createSsoMiddleware({
 *   clientId: "my-app",
 *   ssoBaseUrl: "https://nihplod.cn",
 *   redirectUri: "https://myapp.com/api/auth/callback",
 *   publicPaths: ["/", "/public", "/api/public"],
 * });
 * ```
 */

import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_ACCESS_TOKEN_COOKIE_NAME,
  DEFAULT_STATE_COOKIE_NAME,
  DEFAULT_RETURN_COOKIE_NAME,
  DEFAULT_VERIFIER_COOKIE_NAME,
  getHostCookieOptions,
  getSecureCookieOptions,
} from "./constants";

// ============================================
// 类型定义
// ============================================

export interface SsoMiddlewareConfig {
  /** OAuth Client ID */
  clientId: string;

  /** SSO 中心地址 */
  ssoBaseUrl: string;

  /** 回调 URL（须与注册的 redirect_uri 一致） */
  redirectUri: string;

  /** 请求的 scope（空格分隔），默认 "openid profile" */
  scopes?: string;

  /** 公开路由前缀（不需要认证） */
  publicPaths?: string[];

  /** 回调路径（不触发重定向），默认 "/api/auth/callback" */
  callbackPath?: string;

  /**
   * 主站用户会话 Cookie 名称，用于检测是否已有 SSO 会话。
   * 默认 "__Host-user_token"（与主站 C 端登录 Cookie 一致）。
   */
  ssoCookieName?: string;

  /**
   * OAuth Client Secret（Confidential Client 使用）
   * 浏览器端 Public Client 应省略。
   */
  clientSecret?: string;

  /** Access Token Cookie 名称，默认 __Host-nihplod_sso_at */
  accessTokenCookieName?: string;

  /** State Cookie 名称，默认 __Host-nihplod_sso_state */
  stateCookieName?: string;

  /** Return URL Cookie 名称，默认 __Host-nihplod_sso_return */
  returnUrlCookieName?: string;

  /** PKCE Verifier Cookie 名称，默认 __Secure-nihplod_sso_verifier */
  verifierCookieName?: string;
}

// ============================================
// 工具函数
// ============================================

/**
 * 生成安全随机字符串（Edge Runtime 兼容）
 * 使用 crypto.getRandomValues（Edge Runtime 支持）
 * 拒绝采样法保证 charset 均匀分布
 */
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

/**
 * 计算 PKCE S256 code_challenge（Edge Runtime 兼容）
 *
 * 使用 Web Crypto API 的 crypto.subtle.digest("SHA-256")，
 * Edge Runtime 18+ 完全支持。
 */
async function computeCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * 路径匹配（支持 /:path* 通配符）
 */
function matchesPath(pathname: string, paths: string[]): boolean {
  return paths.some((path) => {
    if (pathname === path) return true;
    if (path.endsWith("/:path*") && pathname.startsWith(path.replace("/:path*", ""))) return true;
    if (pathname.startsWith(path + "/")) return true;
    return false;
  });
}

/**
 * 通过主站 Introspection 端点校验 access_token 是否仍有效。
 * Confidential Client（BFF）应配置 clientSecret，防止伪造 Cookie 绕过。
 */
async function introspectAccessToken(
  token: string,
  ssoBaseUrl: string,
  clientId: string,
  clientSecret?: string
): Promise<boolean> {
  try {
    const body = new URLSearchParams({
      token,
      token_type_hint: "access_token",
      client_id: clientId,
    });
    if (clientSecret) {
      body.set("client_secret", clientSecret);
    }

    const res = await fetch(`${ssoBaseUrl}/api/oauth/introspect`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) return false;
    const data = (await res.json()) as { active?: boolean };
    return data.active === true;
  } catch {
    return false;
  }
}

// ============================================
// Middleware 工厂函数
// ============================================

export function createSsoMiddleware(config: SsoMiddlewareConfig) {
  const {
    clientId,
    clientSecret,
    ssoBaseUrl,
    redirectUri,
    scopes = "openid profile",
    publicPaths = [],
    callbackPath = "/api/auth/callback",
    ssoCookieName = "__Host-user_token",
    accessTokenCookieName = DEFAULT_ACCESS_TOKEN_COOKIE_NAME,
    stateCookieName = DEFAULT_STATE_COOKIE_NAME,
    returnUrlCookieName = DEFAULT_RETURN_COOKIE_NAME,
    verifierCookieName = DEFAULT_VERIFIER_COOKIE_NAME,
  } = config;

  // 规范化 ssoBaseUrl
  const normalizedBase = ssoBaseUrl.replace(/\/+$/, "");

  return async function ssoMiddleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Exclude Next.js internal routes and static assets
    if (
      pathname.startsWith("/_next/") ||
      pathname.startsWith("/favicon.ico") ||
      pathname.match(/\.(ico|png|jpg|jpeg|svg|css|js|woff2?)$/)
    ) {
      return NextResponse.next();
    }

    // Callback path: let the callback handler deal with it
    if (pathname === callbackPath) {
      return NextResponse.next();
    }

    // Public paths: no auth required
    const allPublicPaths = [callbackPath, ...publicPaths];
    if (matchesPath(pathname, allPublicPaths)) {
      return NextResponse.next();
    }

    // Check for existing SSO session
    const ssoSession = request.cookies.get(ssoCookieName);
    if (ssoSession?.value) {
      return NextResponse.next();
    }

    // Check for access_token in cookie (set by callback handler)
    const accessTokenCookie = request.cookies.get(accessTokenCookieName);
    if (accessTokenCookie?.value) {
      // 调用 Introspection 精确校验 token 是否仍有效。
      // Confidential Client 携带 clientSecret；Public Client 仅传 clientId。
      const tokenActive = await introspectAccessToken(
        accessTokenCookie.value,
        normalizedBase,
        clientId,
        clientSecret
      );

      if (tokenActive) {
        return NextResponse.next();
      }
      // Token 无效或已过期：清除 cookie 并继续到 SSO 重定向
    }

    // No auth: redirect to SSO
    const state = generateRandomString(32);
    const verifier = generateRandomString(64);

    // 在 Edge Runtime 中计算 PKCE code_challenge（SHA-256 + base64url）
    const challenge = await computeCodeChallenge(verifier);

    const authorizeParams = new URLSearchParams();
    authorizeParams.set("response_type", "code");
    authorizeParams.set("client_id", clientId);
    authorizeParams.set("redirect_uri", redirectUri);
    authorizeParams.set("scope", scopes);
    authorizeParams.set("state", state);
    authorizeParams.set("code_challenge", challenge);
    authorizeParams.set("code_challenge_method", "S256");

    const loginUrl = new URL("/api/oauth/authorize", normalizedBase);
    loginUrl.search = authorizeParams.toString();

    const response = NextResponse.redirect(loginUrl);

    // Set state cookie for CSRF verification on callback
    response.cookies.set(stateCookieName, state, getHostCookieOptions(600));

    // Set PKCE verifier cookie（httpOnly，供 callback handler 使用）
    // 使用 __Secure- 前缀，允许写入 callbackPath
    response.cookies.set(verifierCookieName, verifier, getSecureCookieOptions(600, callbackPath));

    // Set return URL cookie
    response.cookies.set(returnUrlCookieName, request.url, getHostCookieOptions(600));

    // 如果存在过期的 access_token cookie，立即清除
    if (accessTokenCookie?.value) {
      response.cookies.set(accessTokenCookieName, "", getHostCookieOptions(0));
    }

    return response;
  };
}
