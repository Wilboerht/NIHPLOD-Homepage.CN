/**
 * SSO 登出 Route Handler
 *
 * 处理本地登出 + RP-Initiated Logout：
 * 1. 调用主站 revocation_endpoint 撤销当前 refresh_token
 * 2. 清除本应用所有 SSO Cookie
 * 3. 重定向到 NIHPLOD 中心登出页（可选）
 */

import { createLogoutRouteHandler } from "@nihplod/sso-sdk/next";

export const runtime = "nodejs";

// 与 middleware 保持一致：本地 HTTP 开发开启 insecureLocalDev
const isHttpLocalDev = (process.env.SSO_REDIRECT_URI || "").startsWith("http://");

const logoutHandler = createLogoutRouteHandler({
  clientId: process.env.SSO_CLIENT_ID || "your-client-id",
  clientSecret: process.env.SSO_CLIENT_SECRET,
  ssoBaseUrl: process.env.SSO_BASE_URL || "https://nihplod.cn",
  redirectUri: process.env.SSO_REDIRECT_URI || "http://localhost:3002/api/auth/callback",
  postLogoutRedirectUri: process.env.SSO_POST_LOGOUT_REDIRECT_URI || "http://localhost:3002/",
  // 全局登出：调用 SSO end-session 并回跳 postLogoutRedirectUri
  // （redirectToSso 已废弃，请使用 defaultScope）
  defaultScope: "global",
  insecureLocalDev: isHttpLocalDev,
});

// GET：不执行登出，返回确认页（防登出 CSRF）；带合法 state 的 GET 视为 RP-Initiated Logout 回跳
export const GET = logoutHandler;
// POST：实际执行登出（撤销 refresh_token + 清 Cookie + 跳转 SSO 登出页）
export const POST = logoutHandler;
