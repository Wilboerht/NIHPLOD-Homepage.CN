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

export const GET = createLogoutRouteHandler({
  clientId: process.env.SSO_CLIENT_ID || "your-client-id",
  clientSecret: process.env.SSO_CLIENT_SECRET,
  ssoBaseUrl: process.env.SSO_BASE_URL || "https://nihplod.cn",
  redirectUri: process.env.SSO_REDIRECT_URI || "http://localhost:3002/api/auth/callback",
  postLogoutRedirectUri: process.env.SSO_POST_LOGOUT_REDIRECT_URI || "http://localhost:3002/",
  redirectToSso: true,
});
