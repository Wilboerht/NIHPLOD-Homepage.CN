import { NextRequest, NextResponse } from 'next/server';

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

interface SsoMiddlewareConfig {
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
    /** PKCE Verifier Cookie 名称，默认 __Host-nihplod_sso_verifier */
    verifierCookieName?: string;
}
declare function createSsoMiddleware(config: SsoMiddlewareConfig): (request: NextRequest) => Promise<NextResponse<unknown>>;

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

interface CallbackRouteConfig {
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
    /** State Cookie 名称，默认 __Host-nihplod_sso_state */
    stateCookieName?: string;
    /** Return URL Cookie 名称，默认 __Host-nihplod_sso_return */
    returnUrlCookieName?: string;
    /** PKCE Verifier Cookie 名称，默认 __Host-nihplod_sso_verifier */
    verifierCookieName?: string;
}
declare function createCallbackRouteHandler(config: CallbackRouteConfig): (request: NextRequest) => Promise<NextResponse<unknown>>;

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
 * export const GET = createLogoutRouteHandler({
 *   clientId: "my-app",
 *   clientSecret: "optional-secret",
 *   ssoBaseUrl: "https://nihplod.cn",
 *   redirectUri: "https://myapp.com/api/auth/callback",
 *   postLogoutRedirectUri: "https://myapp.com/",
 * });
 * ```
 */

interface LogoutRouteConfig {
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
    /** State Cookie 名称 */
    stateCookieName?: string;
    /** Return URL Cookie 名称 */
    returnUrlCookieName?: string;
    /** PKCE Verifier Cookie 名称 */
    verifierCookieName?: string;
    /** 回调路径（用于清除 verifier cookie），默认 "/api/auth/callback" */
    callbackPath?: string;
}
declare function createLogoutRouteHandler(config: LogoutRouteConfig): (request: NextRequest) => Promise<NextResponse<unknown>>;

/**
 * Next.js 集成默认 Cookie 名称
 *
 * 统一使用 __Host- 前缀，要求：
 * - Secure
 * - Path=/
 * - 无 Domain 属性
 */
declare const DEFAULT_ACCESS_TOKEN_COOKIE_NAME = "__Host-nihplod_sso_at";
declare const DEFAULT_REFRESH_TOKEN_COOKIE_NAME = "__Host-nihplod_sso_rt";
declare const DEFAULT_STATE_COOKIE_NAME = "__Host-nihplod_sso_state";
declare const DEFAULT_RETURN_COOKIE_NAME = "__Host-nihplod_sso_return";
declare const DEFAULT_VERIFIER_COOKIE_NAME = "__Host-nihplod_sso_verifier";
/** __Host- 前缀 Cookie 的安全选项 */
declare function getHostCookieOptions(maxAge?: number): {
    httpOnly: true;
    secure: true;
    sameSite: "lax";
    path: "/";
    maxAge?: number;
};

export { type CallbackRouteConfig, DEFAULT_ACCESS_TOKEN_COOKIE_NAME, DEFAULT_REFRESH_TOKEN_COOKIE_NAME, DEFAULT_RETURN_COOKIE_NAME, DEFAULT_STATE_COOKIE_NAME, DEFAULT_VERIFIER_COOKIE_NAME, type LogoutRouteConfig, type SsoMiddlewareConfig, createCallbackRouteHandler, createLogoutRouteHandler, createSsoMiddleware, getHostCookieOptions };
