/**
 * App Router 回调 Route Handler
 *
 * 在 /api/auth/callback 路由中处理 OAuth 回调：
 * 1. 验证 state 参数
 * 2. 用授权码交换 token
 * 3. 设置 session cookie
 * 4. 重定向到原始页面
 *
 * ⚠️ 此 handler 仅运行在 Node.js Runtime（非 Edge），可以使用 crypto.subtle。
 *
 * 用法 (src/app/api/auth/callback/route.ts):
 * ```ts
 * import { createCallbackRouteHandler } from "@nihplod/sso-sdk/next";
 *
 * export const GET = createCallbackRouteHandler({
 *   clientId: "my-app",
 *   ssoBaseUrl: "https://nihplod.cn",
 *   redirectUri: "https://myapp.com/api/auth/callback",
 *   tokenCookieName: "nihplod_sso_at",
 * });
 * ```
 */

import { NextRequest, NextResponse } from "next/server";
import { validateIdToken } from "../core/id-token";
import {
  DEFAULT_ACCESS_TOKEN_COOKIE_NAME,
  DEFAULT_REFRESH_TOKEN_COOKIE_NAME,
  DEFAULT_ID_TOKEN_COOKIE_NAME,
  DEFAULT_STATE_COOKIE_NAME,
  DEFAULT_RETURN_COOKIE_NAME,
  DEFAULT_VERIFIER_COOKIE_NAME,
  getHostCookieOptions,
  getSecureCookieOptions,
} from "./constants";

// ============================================
// 类型定义
// ============================================

export interface CallbackRouteConfig {
  /** OAuth Client ID */
  clientId: string;

  /** SSO 中心地址 */
  ssoBaseUrl: string;

  /** 回调 URL（须与注册的 redirect_uri 一致） */
  redirectUri: string;

  /**
   * OAuth Client Secret（可选）。
   * 对于 Confidential Client（BFF/Next.js），应传入 clientSecret
   * 以提供第二因素认证。对于 Public Client（SPA），应省略此字段。
   */
  clientSecret?: string;

  /** 成功回调后重定向的默认路径，默认 "/" */
  defaultReturnPath?: string;

  /** Access Token Cookie 名称，默认 __Host-nihplod_sso_at */
  accessTokenCookieName?: string;

  /** Refresh Token Cookie 名称，默认 __Host-nihplod_sso_rt */
  refreshTokenCookieName?: string;

  /** ID Token Cookie 名称，默认 __Host-nihplod_sso_id */
  idTokenCookieName?: string;

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
 * 校验回调后的 returnUrl 是否可信。
 * 仅允许：相对路径（且不以 // 开头）或与当前 origin 完全一致。
 */
function isTrustedReturnUrl(url: string, currentOrigin: string): boolean {
  if (!url) return false;
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try {
    return new URL(url).origin === currentOrigin;
  } catch {
    return false;
  }
}

// ID Token 预校验逻辑已收敛到 ../core/id-token.ts

// ============================================
// Route Handler 工厂函数
// ============================================

export function createCallbackRouteHandler(config: CallbackRouteConfig) {
  const {
    clientId,
    ssoBaseUrl,
    redirectUri,
    clientSecret,
    defaultReturnPath = "/",
    accessTokenCookieName = DEFAULT_ACCESS_TOKEN_COOKIE_NAME,
    refreshTokenCookieName = DEFAULT_REFRESH_TOKEN_COOKIE_NAME,
    idTokenCookieName = DEFAULT_ID_TOKEN_COOKIE_NAME,
    stateCookieName = DEFAULT_STATE_COOKIE_NAME,
    returnUrlCookieName = DEFAULT_RETURN_COOKIE_NAME,
    verifierCookieName = DEFAULT_VERIFIER_COOKIE_NAME,
  } = config;

  const normalizedBase = ssoBaseUrl.replace(/\/+$/, "");

  return async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl;

    // 检查错误
    const error = searchParams.get("error");
    if (error) {
      const desc = searchParams.get("error_description") || error;
      return NextResponse.json(
        { error: "authorization_failed", error_description: desc },
        { status: 400 }
      );
    }

    const code = searchParams.get("code");
    const returnedState = searchParams.get("state");

    if (!code) {
      return NextResponse.json(
        {
          error: "invalid_request",
          error_description: "缺少 authorization code",
        },
        { status: 400 }
      );
    }

    // 验证 state（从 cookie 中读取原始 state，CSRF 必需）
    const savedState = request.cookies.get(stateCookieName)?.value;
    if (!savedState) {
      return NextResponse.json(
        {
          error: "invalid_request",
          error_description: "State 参数缺失，请重新发起授权请求",
        },
        { status: 400 }
      );
    }
    if (returnedState !== savedState) {
      return NextResponse.json(
        {
          error: "invalid_request",
          error_description: "State 参数不匹配，可能存在 CSRF 攻击",
        },
        { status: 400 }
      );
    }

    // 读取 PKCE code_verifier（middleware 存入的 httpOnly cookie）
    const verifier = request.cookies.get(verifierCookieName)?.value;
    if (!verifier) {
      return NextResponse.json(
        {
          error: "invalid_request",
          error_description: "PKCE verifier 缺失，请重新发起授权请求",
        },
        { status: 400 }
      );
    }

    // 交换 token
    const tokenEndpoint = `${normalizedBase}/api/oauth/token`;
    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("code", code);
    body.set("client_id", clientId);
    body.set("redirect_uri", redirectUri);
    body.set("code_verifier", verifier);
    if (clientSecret) {
      body.set("client_secret", clientSecret);
    }

    // 带重试的 token 交换（1 次重试 + 指数退避）
    let res: Response;
    let lastError: unknown;
    const maxRetries = 1;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        // 指数退避：1s * 2^attempt
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }
      try {
        res = await fetch(tokenEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        });
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        if (attempt >= maxRetries) {
          return NextResponse.json(
            { error: "server_error", error_description: "Token 请求失败，已重试仍不可达" },
            { status: 502 }
          );
        }
      }
    }

    if (lastError || !res!) {
      return NextResponse.json(
        { error: "server_error", error_description: "Token 请求失败" },
        { status: 502 }
      );
    }

    if (!res.ok) {
      let errData: Record<string, unknown> = {};
      try {
        errData = await res.json();
      } catch { /* ignore */ }
      return NextResponse.json(
        {
          error: "token_request_failed",
          error_description:
            (errData.error_description as string) || `Token 请求失败: HTTP ${res.status}`,
        },
        { status: 502 }
      );
    }

    const tokenData: {
      access_token: string;
      token_type: string;
      expires_in: number;
      refresh_token: string;
      id_token?: string;
    } = await res.json();

    // 在设置 Cookie 前预校验 ID Token：防止伪造 token 写入浏览器
    if (tokenData.id_token) {
      try {
        await validateIdToken(
          tokenData.id_token,
          tokenData.access_token,
          normalizedBase,
          clientId
        );
      } catch (err) {
        return NextResponse.json(
          {
            error: "id_token_invalid",
            error_description: err instanceof Error ? err.message : "ID Token 验证失败",
          },
          { status: 400 }
        );
      }
    }

    // 读取 return URL，并做开放重定向防护
    const rawReturnUrl =
      request.cookies.get(returnUrlCookieName)?.value || defaultReturnPath;
    const returnUrl = isTrustedReturnUrl(rawReturnUrl, request.nextUrl.origin)
      ? rawReturnUrl
      : "/";

    // 重定向并设置 cookie
    const response = NextResponse.redirect(new URL(returnUrl, request.url));

    // 设置 access_token cookie (httpOnly, Secure, SameSite=Lax, Path=/)
    response.cookies.set(accessTokenCookieName, tokenData.access_token, {
      ...getHostCookieOptions(tokenData.expires_in),
    });

    // 设置 refresh_token cookie（使用服务端返回的过期时间动态计算）
    // 服务端 refresh_token 通常是 30 天，此处使用 expires_in 映射（若响应包含）
    // 回退到 30 天默认值
    const refreshMaxAge =
      (tokenData as Record<string, unknown>).refresh_expires_in != null
        ? (tokenData as Record<string, unknown>).refresh_expires_in as number
        : 30 * 24 * 60 * 60;

    response.cookies.set(refreshTokenCookieName, tokenData.refresh_token, {
      ...getHostCookieOptions(refreshMaxAge),
    });

    // 设置 id_token cookie，用于 RP-Initiated Logout 的 id_token_hint
    if (tokenData.id_token) {
      response.cookies.set(idTokenCookieName, tokenData.id_token, {
        ...getHostCookieOptions(refreshMaxAge),
      });
    }

    // 清除临时 cookies: state / return URL
    response.cookies.set(stateCookieName, "", getHostCookieOptions(0));
    response.cookies.set(returnUrlCookieName, "", getHostCookieOptions(0));

    // 清除 PKCE verifier cookie，必须使用写入时的 path（callbackPath）
    // 由于 callback handler 不知道 middleware 的 callbackPath，这里保守地
    // 同时清除 path=/ 和 path=当前请求路径两种可能
    response.cookies.set(verifierCookieName, "", getSecureCookieOptions(0, "/"));
    response.cookies.set(verifierCookieName, "", getSecureCookieOptions(0, request.nextUrl.pathname));

    return response;
  };
}
