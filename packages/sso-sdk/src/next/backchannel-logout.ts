/**
 * App Router Backchannel Logout 接收端 Route Handler
 *
 * 接收 SSO 中心在用户全局登出 / 撤销授权时推送的 logout_token
 * （OIDC Back-Channel Logout 1.0），验证通过后清除本站 SSO cookie 并
 * 调用 onLogout 钩子（子站在钩子里清除自己的本地会话，如数据库 session）。
 *
 * 前置条件：在 SSO 中心管理后台为本 client 注册 backchannelLogoutUri
 * 指向本路由的公网地址（必须 HTTPS）。
 *
 * 用法 (src/app/api/auth/backchannel-logout/route.ts):
 * ```ts
 * import { createBackchannelLogoutRouteHandler } from "@nihplod/sso-sdk/next";
 *
 * export const POST = createBackchannelLogoutRouteHandler({
 *   clientId: "my-app",
 *   ssoBaseUrl: "https://nihplod.cn",
 *   onLogout: async ({ sub, sid }) => {
 *     // 清除子站本地会话（按 sub 或 sid 定位）
 *   },
 * });
 * ```
 */

import { NextRequest, NextResponse } from "next/server";
import { SsoError } from "../core/errors";
import { verifyLogoutToken, type LogoutTokenPayload } from "../core/logout-token";
import {
  DEFAULT_ACCESS_TOKEN_COOKIE_NAME,
  DEFAULT_REFRESH_TOKEN_COOKIE_NAME,
  DEFAULT_ID_TOKEN_COOKIE_NAME,
  getHostCookieOptions,
  resolveInsecureLocalDev,
  toInsecureCookieName,
} from "./constants";

// ============================================
// 类型定义
// ============================================

export interface BackchannelLogoutRouteConfig {
  /** OAuth Client ID（logout_token 的 aud 必须等于它） */
  clientId: string;

  /** SSO 中心地址（Discovery / JWKS 基准） */
  ssoBaseUrl: string;

  /**
   * 登出通知钩子：logout_token 验证通过后调用，
   * 子站在此处按 sub / sid 清除自己的本地会话（数据库 session 等）。
   * 抛错时返回 500，让 IdP 重投。
   */
  onLogout?: (
    payload: LogoutTokenPayload,
    request: NextRequest
  ) => void | Promise<void>;

  /** Access Token Cookie 名称 */
  accessTokenCookieName?: string;

  /** Refresh Token Cookie 名称 */
  refreshTokenCookieName?: string;

  /** ID Token Cookie 名称，默认 __Host-nihplod_sso_id */
  idTokenCookieName?: string;

  /**
   * 本地 HTTP 开发模式（默认 false）。关闭 Cookie 的 Secure 属性并去除
   * __Host-/__Secure- 前缀；必须与 middleware / callback / logout 的配置保持一致。
   * 生产严禁启用——生产环境（NODE_ENV=production 且 ssoBaseUrl 为 https）下
   * 该开关会被强制忽略并告警。
   */
  insecureLocalDev?: boolean;
}

// ============================================
// Route Handler 工厂函数
// ============================================

export function createBackchannelLogoutRouteHandler(
  config: BackchannelLogoutRouteConfig
) {
  const { clientId, ssoBaseUrl, onLogout } = config;

  // 生产守卫：与 middleware/callback/logout 一致
  const insecureLocalDev = resolveInsecureLocalDev(
    config.insecureLocalDev ?? false,
    ssoBaseUrl
  );
  const secureCookies = !insecureLocalDev;
  const pickName = (explicit: string | undefined, fallback: string) =>
    insecureLocalDev ? toInsecureCookieName(explicit ?? fallback) : explicit ?? fallback;
  const accessTokenCookieName = pickName(
    config.accessTokenCookieName,
    DEFAULT_ACCESS_TOKEN_COOKIE_NAME
  );
  const refreshTokenCookieName = pickName(
    config.refreshTokenCookieName,
    DEFAULT_REFRESH_TOKEN_COOKIE_NAME
  );
  const idTokenCookieName = pickName(
    config.idTokenCookieName,
    DEFAULT_ID_TOKEN_COOKIE_NAME
  );

  return async function handler(request: NextRequest) {
    // 仅接受 POST（IdP 以 application/x-www-form-urlencoded POST 推送）
    if (request.method !== "POST") {
      return NextResponse.json(
        { error: "method_not_allowed", error_description: "仅接受 POST 请求" },
        { status: 405 }
      );
    }

    const logoutToken = new URLSearchParams(await request.text()).get(
      "logout_token"
    );
    if (!logoutToken) {
      return NextResponse.json(
        { error: "invalid_request", error_description: "缺少 logout_token" },
        { status: 400 }
      );
    }

    let payload: LogoutTokenPayload;
    try {
      payload = await verifyLogoutToken(logoutToken, ssoBaseUrl, clientId);
    } catch (err) {
      // 验证失败一律 400（规范：RP 认为 token 无效时返回 400，IdP 不再以该 token 重试）
      const code = err instanceof SsoError ? err.code : "logout_token_invalid";
      const description =
        err instanceof SsoError ? err.description : "Logout Token 验证失败";
      return NextResponse.json(
        { error: code, error_description: description },
        { status: 400 }
      );
    }

    // 先调用钩子清子站本地会话：失败返回 500，让 IdP 重投
    try {
      await onLogout?.(payload, request);
    } catch (err) {
      console.error(
        "[SSO SDK] backchannel logout onLogout 钩子执行失败:",
        err
      );
      return NextResponse.json(
        { error: "server_error", error_description: "onLogout 处理失败" },
        { status: 500 }
      );
    }

    // 清除本站 SSO cookie（backchannel 是服务器间调用，清 cookie 影响不到
    // 用户浏览器——用户侧由下一次请求时 middleware 发现会话失效兜住；照做无害）
    const res = new NextResponse(null, { status: 200 });
    res.cookies.set(accessTokenCookieName, "", getHostCookieOptions(0, secureCookies));
    res.cookies.set(refreshTokenCookieName, "", getHostCookieOptions(0, secureCookies));
    res.cookies.set(idTokenCookieName, "", getHostCookieOptions(0, secureCookies));
    return res;
  };
}
