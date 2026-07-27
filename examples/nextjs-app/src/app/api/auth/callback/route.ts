/**
 * OAuth 回调 Route Handler
 *
 * SSO 中心在用户授权后重定向到此端点。
 * 自动交换 token 并设置 httpOnly cookie。
 */
import { createCallbackRouteHandler } from "@nihplod/sso-sdk/next";

export const GET = createCallbackRouteHandler({
  clientId: "your-client-id", // ← 替换
  ssoBaseUrl: "https://nihplod.cn",
  redirectUri: "http://localhost:3002/api/auth/callback", // ← 替换
  defaultReturnPath: "/dashboard",
});
