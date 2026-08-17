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
    /**
     * 是否对 ssoCookieName 对应的主站 Cookie 进行 Introspection 二次验证。
     * 默认 true（推荐）。设为 false 时仅检查 Cookie 存在性，延迟最低但可能放行
     * 已失效/被撤销的会话 —— 中间件本质上只是 UX 层，敏感数据必须在
     * Route Handler / Server Component 中二次校验。
     */
    validateSsoCookie?: boolean;
    /** Access Token Cookie 名称，默认 __Host-nihplod_sso_at */
    accessTokenCookieName?: string;
    /** State Cookie 名称，默认 __Host-nihplod_sso_state */
    stateCookieName?: string;
    /** Return URL Cookie 名称，默认 __Host-nihplod_sso_return */
    returnUrlCookieName?: string;
    /** PKCE Verifier Cookie 名称，默认 __Secure-nihplod_sso_verifier */
    verifierCookieName?: string;
    /**
     * 本地 HTTP 开发模式（默认 false）。
     *
     * ⚠️ 仅限 http://localhost 开发：关闭 Cookie 的 Secure 属性并去除
     * __Host-/__Secure- 前缀（浏览器拒绝在 HTTP 下写入带这两个前缀的 Cookie，
     * 否则会出现「登录后 cookie 写不进去 → middleware 永远判定未登录 →
     * 反复跳 SSO」的无限重定向）。开启时启动告警；生产环境严禁启用——
     * 生产环境（NODE_ENV=production 且 ssoBaseUrl 为 https）下该开关会被
     * 强制忽略并告警，仍走 secure cookie。
     * middleware / callback / logout 三处配置需保持一致。
     */
    insecureLocalDev?: boolean;
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
    /** ID Token Cookie 名称，默认 __Host-nihplod_sso_id */
    idTokenCookieName?: string;
    /** State Cookie 名称，默认 __Host-nihplod_sso_state */
    stateCookieName?: string;
    /** Return URL Cookie 名称，默认 __Host-nihplod_sso_return */
    returnUrlCookieName?: string;
    /** PKCE Verifier Cookie 名称，默认 __Secure-nihplod_sso_verifier */
    verifierCookieName?: string;
    /**
     * 本地 HTTP 开发模式（默认 false）。关闭 Cookie 的 Secure 属性并去除
     * __Host-/__Secure- 前缀；必须与 createSsoMiddleware 的配置保持一致，
     * 否则读不到 middleware 写入的 state/verifier Cookie。生产严禁启用——
     * 生产环境（NODE_ENV=production 且 ssoBaseUrl 为 https）下该开关会被
     * 强制忽略并告警。
     */
    insecureLocalDev?: boolean;
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
    /**
     * 本地 HTTP 开发模式（默认 false）。关闭 Cookie 的 Secure 属性并去除
     * __Host-/__Secure- 前缀；必须与 middleware / callback 的配置保持一致，
     * 否则无法清除它们写入的 Cookie。生产严禁启用——生产环境
     * （NODE_ENV=production 且 ssoBaseUrl 为 https）下该开关会被强制忽略并告警。
     */
    insecureLocalDev?: boolean;
}
declare function createLogoutRouteHandler(config: LogoutRouteConfig): (request: NextRequest) => Promise<NextResponse<unknown>>;

/**
 * Next.js 集成默认 Cookie 名称
 *
 * 除 verifier 外统一使用 __Host- 前缀，要求：
 * - Secure
 * - Path=/
 * - 无 Domain 属性
 *
 * verifier 需要写入回调路径（非 /），因此使用 __Secure- 前缀。
 */
declare const DEFAULT_ACCESS_TOKEN_COOKIE_NAME = "__Host-nihplod_sso_at";
declare const DEFAULT_REFRESH_TOKEN_COOKIE_NAME = "__Host-nihplod_sso_rt";
declare const DEFAULT_ID_TOKEN_COOKIE_NAME = "__Host-nihplod_sso_id";
declare const DEFAULT_STATE_COOKIE_NAME = "__Host-nihplod_sso_state";
declare const DEFAULT_RETURN_COOKIE_NAME = "__Host-nihplod_sso_return";
declare const DEFAULT_VERIFIER_COOKIE_NAME = "__Secure-nihplod_sso_verifier";
declare const DEFAULT_LOGOUT_STATE_COOKIE_NAME = "__Host-nihplod_sso_logout_state";
/**
 * insecureLocalDev 场景：去除 __Host-/__Secure- 前缀。
 * 浏览器强制要求带这两个前缀的 Cookie 必须设置 Secure，
 * HTTP 本地开发时若保留前缀，即使 secure=false 也会被拒绝写入。
 */
declare function toInsecureCookieName(name: string): string;
/** __Host- 前缀 Cookie 的安全选项（Path 必须为 /） */
declare function getHostCookieOptions(maxAge?: number, secure?: boolean): {
    httpOnly: true;
    secure: boolean;
    sameSite: "lax";
    path: "/";
    maxAge?: number;
};
/** __Secure- 前缀 Cookie 的安全选项（允许自定义 Path） */
declare function getSecureCookieOptions(maxAge?: number, path?: string, secure?: boolean): {
    httpOnly: true;
    secure: boolean;
    sameSite: "lax";
    path: string;
    maxAge?: number;
};

export { type CallbackRouteConfig, DEFAULT_ACCESS_TOKEN_COOKIE_NAME, DEFAULT_ID_TOKEN_COOKIE_NAME, DEFAULT_LOGOUT_STATE_COOKIE_NAME, DEFAULT_REFRESH_TOKEN_COOKIE_NAME, DEFAULT_RETURN_COOKIE_NAME, DEFAULT_STATE_COOKIE_NAME, DEFAULT_VERIFIER_COOKIE_NAME, type LogoutRouteConfig, type SsoMiddlewareConfig, createCallbackRouteHandler, createLogoutRouteHandler, createSsoMiddleware, getHostCookieOptions, getSecureCookieOptions, toInsecureCookieName };
