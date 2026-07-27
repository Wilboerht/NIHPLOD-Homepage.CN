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
    /** Token 存储 cookie 名称，默认 "nihplod_sso_at" */
    tokenCookieName?: string;
    /** Cookie domain（可选） */
    cookieDomain?: string;
    /** 成功回调后重定向的默认路径，默认 "/" */
    defaultReturnPath?: string;
}
declare function createCallbackRouteHandler(config: CallbackRouteConfig): (request: NextRequest) => Promise<NextResponse<unknown>>;

export { type SsoMiddlewareConfig, createCallbackRouteHandler, createSsoMiddleware };
