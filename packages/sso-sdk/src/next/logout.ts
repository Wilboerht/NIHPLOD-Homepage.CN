/**
 * App Router 登出 Route Handler
 *
 * 在 /api/auth/logout 路由中处理本地登出 + RP-Initiated Logout：
 * 1. 从 cookie 读取 refresh_token 并调用 revocation_endpoint 撤销
 * 2. 清除所有 SSO cookie
 * 3. 按退出范围（defaultScope / 表单 global 字段）决定：
 *    - "local"（默认）：仅退出本站，重定向回本站首页
 *    - "global"：重定向到 SSO 中心 end-session，全局退出所有 NIHPLOD 平台
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
 * // 推荐使用 POST 触发登出（防登出 CSRF）；GET 不执行登出，仅返回确认页
 * export const GET = handler;
 * export const POST = handler;
 * ```
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchDiscoveryCached } from "../core/discovery";
import {
  DEFAULT_ACCESS_TOKEN_COOKIE_NAME,
  DEFAULT_REFRESH_TOKEN_COOKIE_NAME,
  DEFAULT_ID_TOKEN_COOKIE_NAME,
  DEFAULT_STATE_COOKIE_NAME,
  DEFAULT_NONCE_COOKIE_NAME,
  DEFAULT_RETURN_COOKIE_NAME,
  DEFAULT_VERIFIER_COOKIE_NAME,
  DEFAULT_LOGOUT_STATE_COOKIE_NAME,
  getHostCookieOptions,
  getSecureCookieOptions,
  resolveInsecureLocalDev,
  toInsecureCookieName,
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

  /**
   * 默认退出范围（默认 "local"）：
   * - "local"：仅退出本站（撤销 refresh_token + 清本地 cookie），不跳转 SSO 中心；
   * - "global"：同时跳转 SSO 中心 end-session 全局退出（RP-Initiated Logout）。
   * 用户可在 GET 确认页勾选"同时退出所有 NIHPLOD 平台"后通过表单字段
   * global=1 覆盖默认值；POST 表单携带 global 字段时以表单为准。
   */
  defaultScope?: "local" | "global";

  /**
   * @deprecated 请改用 defaultScope（true → "global"，false → "local"）。
   * 仅为兼容保留；与 defaultScope 同时传入时以 defaultScope 为准。
   */
  redirectToSso?: boolean;

  /** Access Token Cookie 名称 */
  accessTokenCookieName?: string;

  /** Refresh Token Cookie 名称 */
  refreshTokenCookieName?: string;

  /** ID Token Cookie 名称，默认 __Host-nihplod_sso_id */
  idTokenCookieName?: string;

  /** State Cookie 名称 */
  stateCookieName?: string;

  /** OIDC Nonce Cookie 名称，默认 __Host-nihplod_sso_nonce（须与 middleware/callback 一致） */
  nonceCookieName?: string;

  /** Return URL Cookie 名称 */
  returnUrlCookieName?: string;

  /** PKCE Verifier Cookie 名称 */
  verifierCookieName?: string;

  /** 回调路径（用于清除 verifier cookie），默认 "/api/auth/callback" */
  callbackPath?: string;

  /** Logout State Cookie 名称（RP-Initiated Logout CSRF 防护），默认 __Host-nihplod_sso_logout_state */
  logoutStateCookieName?: string;

  /**
   * 服务端到服务端调用的内网地址（可选，如 http://127.0.0.1:3000）。
   * 仅用于 discovery / revocation 等服务器间请求；浏览器跳转
   * （end-session 等）始终使用 ssoBaseUrl 公网地址。
   * 适用于子站与 SSO 中心同机/同内网部署：避免经公网代理回源的延迟。
   */
  serverBaseUrl?: string;

  /**
   * 本地 HTTP 开发模式（默认 false）。关闭 Cookie 的 Secure 属性并去除
   * __Host-/__Secure- 前缀；必须与 middleware / callback 的配置保持一致，
   * 否则无法清除它们写入的 Cookie。生产严禁启用——生产环境
   * （NODE_ENV=production 且 ssoBaseUrl 为 https）下该开关会被强制忽略并告警。
   */
  insecureLocalDev?: boolean;
}

// ============================================
// 工具函数
// ============================================

/** GET 确认页 HTML（登出 CSRF 防护：GET 不执行登出，由用户点击按钮发起 POST） */
function buildLogoutConfirmHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>确认退出登录</title>
</head>
<body style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui,sans-serif;">
  <form method="post" style="text-align:center;">
    <p>确定要退出登录吗？</p>
    <label style="display:flex;align-items:center;justify-content:center;gap:6px;margin:12px 0;font-size:14px;color:#374151;cursor:pointer;">
      <input type="checkbox" name="global" value="1">同时退出所有 NIHPLOD 平台
    </label>
    <button type="submit" style="padding:10px 20px;background-color:#ef4444;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;">退出登录</button>
    <p><a href="/" style="color:#2563eb;text-decoration:underline;">取消并返回首页</a></p>
  </form>
</body>
</html>`;
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
    callbackPath = "/api/auth/callback",
    insecureLocalDev: insecureLocalDevOpt = false,
  } = config;

  // 退出范围解析：defaultScope 优先（默认 "local"，仅退出本站）；
  // redirectToSso 为 deprecated 别名，传入时告警并按 true→global / false→local 映射
  let defaultScope: "local" | "global" = config.defaultScope ?? "local";
  if (config.redirectToSso !== undefined) {
    console.warn(
      "[SSO SDK] redirectToSso 已弃用，请改用 defaultScope" +
      "（redirectToSso: true → defaultScope: \"global\"，false → \"local\"）。" +
      "注意：默认退出范围已变更为 \"local\"（仅退出本站，不跳转 SSO 中心）。"
    );
    if (config.defaultScope === undefined) {
      defaultScope = config.redirectToSso ? "global" : "local";
    }
  }

  // 生产守卫：NODE_ENV=production 且 ssoBaseUrl 为 https 时强制忽略该开关（与 middleware/callback 一致）
  const insecureLocalDev = resolveInsecureLocalDev(insecureLocalDevOpt, ssoBaseUrl);

  // insecureLocalDev：与 middleware/callback 一致地去前缀 + 关 Secure
  const secureCookies = !insecureLocalDev;
  const pickName = (explicit: string | undefined, fallback: string) =>
    insecureLocalDev ? toInsecureCookieName(explicit ?? fallback) : explicit ?? fallback;
  const accessTokenCookieName = pickName(config.accessTokenCookieName, DEFAULT_ACCESS_TOKEN_COOKIE_NAME);
  const refreshTokenCookieName = pickName(config.refreshTokenCookieName, DEFAULT_REFRESH_TOKEN_COOKIE_NAME);
  const idTokenCookieName = pickName(config.idTokenCookieName, DEFAULT_ID_TOKEN_COOKIE_NAME);
  const stateCookieName = pickName(config.stateCookieName, DEFAULT_STATE_COOKIE_NAME);
  const nonceCookieName = pickName(config.nonceCookieName, DEFAULT_NONCE_COOKIE_NAME);
  const returnUrlCookieName = pickName(config.returnUrlCookieName, DEFAULT_RETURN_COOKIE_NAME);
  const verifierCookieName = pickName(config.verifierCookieName, DEFAULT_VERIFIER_COOKIE_NAME);
  const logoutStateCookieName = pickName(config.logoutStateCookieName, DEFAULT_LOGOUT_STATE_COOKIE_NAME);

  const normalizedBase = ssoBaseUrl.replace(/\/+$/, "");
  // 服务器间调用（discovery/revoke）的基准地址：配置了内网地址时走内网，
  // 避免经公网代理回源的延迟；浏览器跳转仍用 normalizedBase（公网）
  const normalizedServerBase = (config.serverBaseUrl ?? ssoBaseUrl).replace(/\/+$/, "");

  // 本地跳转的 origin：取 redirectUri 的 origin 而非 request.nextUrl.origin——
  // standalone 部署下后者是进程监听地址（如 http://0.0.0.0:3002），反代场景不可靠。
  const callbackOrigin = new URL(redirectUri).origin;

  /**
   * 登出 handler：同时适配 GET 与 POST（函数本身不区分 method，
   * 在 route.ts 中 `export const GET = handler; export const POST = handler;` 即可）。
   *
   * ⚠️ CSRF 防护：GET 请求可被跨站触发（如 `<img src="/api/auth/logout">`），
   * 因此 GET 且未携带合法 logout state 时不执行登出，仅返回确认页 HTML，
   * 由用户点击按钮以 POST 确认；POST（或携带合法 state 的 GET 回跳）才执行登出。
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
      const res = NextResponse.redirect(callbackOrigin + "/");
      res.cookies.set(logoutStateCookieName, "", getHostCookieOptions(0, secureCookies));
      return res;
    }

    // GET 无 state：可能是跨站图片/预取触发的登出 CSRF，不执行登出，
    // 返回确认页由用户主动 POST 确认（表单 POST 不受 <img>/预取影响）
    if (request.method === "GET") {
      return new NextResponse(buildLogoutConfirmHtml(), {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    // 解析表单中的 global 字段（确认页勾选"同时退出所有 NIHPLOD 平台"后提交 global=1）；
    // 表单未携带 global 字段时回落到配置的 defaultScope
    let formGlobal: string | null = null;
    try {
      formGlobal = new URLSearchParams(await request.text()).get("global");
    } catch {
      // body 读取失败时视为未携带，按 defaultScope 处理
    }
    const effectiveScope: "local" | "global" =
      formGlobal !== null
        ? formGlobal === "1" || formGlobal === "true"
          ? "global"
          : "local"
        : defaultScope;

    const refreshToken = request.cookies.get(refreshTokenCookieName)?.value;
    const idTokenHint = request.cookies.get(idTokenCookieName)?.value;

    // 1. best-effort 撤销服务端 refresh_token
    if (refreshToken) {
      try {
        // 配置了内网地址时直连默认端点（跳过 discovery 的公网端点，
        // 否则文档里的公网 URL 会让调用仍绕行公网）；否则用缓存的 discovery
        const discovery = config.serverBaseUrl
          ? null
          : await fetchDiscoveryCached(normalizedServerBase);
        const revokeUrl = config.serverBaseUrl
          ? `${normalizedServerBase}/api/oauth/revoke`
          : discovery?.revocation_endpoint || `${normalizedBase}/api/oauth/revoke`;
        const body = new URLSearchParams({
          token: refreshToken,
          token_type_hint: "refresh_token",
          client_id: clientId,
        });
        if (clientSecret) {
          body.set("client_secret", clientSecret);
        }
        // 3s 超时兜底：撤销是 best-effort，主站缓慢时不得拖住登出流程
        await fetch(revokeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
          signal: AbortSignal.timeout(3000),
        });
      } catch {
        // 撤销失败不影响本地登出
      }
    }

    // 2. 准备本地清除 SSO cookie 的响应
    const clearCookies = (res: NextResponse) => {
      res.cookies.set(accessTokenCookieName, "", getHostCookieOptions(0, secureCookies));
      res.cookies.set(refreshTokenCookieName, "", getHostCookieOptions(0, secureCookies));
      res.cookies.set(idTokenCookieName, "", getHostCookieOptions(0, secureCookies));
      res.cookies.set(stateCookieName, "", getHostCookieOptions(0, secureCookies));
      res.cookies.set(nonceCookieName, "", getHostCookieOptions(0, secureCookies));
      res.cookies.set(returnUrlCookieName, "", getHostCookieOptions(0, secureCookies));
      res.cookies.set(verifierCookieName, "", getSecureCookieOptions(0, "/", secureCookies));
      res.cookies.set(verifierCookieName, "", getSecureCookieOptions(0, callbackPath, secureCookies));
      return res;
    };

    // 3. global 范围：RP-Initiated Logout 重定向到 SSO 中心，同时必须清除本地 Cookie；
    //    local 范围：仅本站退出，重定向回本站首页
    if (effectiveScope === "global") {
      // discovery 经内网地址拉取（若配置），但文档内端点是 SSO 中心按公网 origin
      // 生成的，可直接用于浏览器跳转；兜底也用公网 base，不得使用内网地址
      const discovery = await fetchDiscoveryCached(normalizedServerBase);
      const endSessionEndpoint =
        discovery?.end_session_endpoint || `${normalizedBase}/api/oauth/end-session`;
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
      res.cookies.set(logoutStateCookieName, logoutState, getHostCookieOptions(600, secureCookies));
      return res;
    }

    return clearCookies(
      NextResponse.redirect(callbackOrigin + "/")
    );
  };
}
