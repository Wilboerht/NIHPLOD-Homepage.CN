/**
 * 登出 Route Handler
 *
 * 清除本地 httpOnly cookie，并可选重定向到 SSO 中心登出页。
 */
import { createLogoutRouteHandler } from "@nihplod/sso-sdk/next";

export const GET = createLogoutRouteHandler({
  clientId: "your-client-id", // ← 替换
  ssoBaseUrl: "https://nihplod.cn",
  redirectUri: "http://localhost:3002/api/auth/callback",
  postLogoutRedirectUri: "http://localhost:3002/",
  redirectToSso: true,
});
