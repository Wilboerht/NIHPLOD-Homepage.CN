/**
 * SSO 回调 Route Handler
 *
 * Middleware 在未登录用户访问受保护路由时将其重定向到 NIHPLOD 授权页，
 * 授权成功后 NIHPLOD 会回跳到本路由。本 Handler 负责：
 * 1. 校验 state（防 CSRF）
 * 2. 用 authorization_code 交换 access_token / refresh_token
 * 3. 写入 httpOnly Cookie
 * 4. 重定向回原始页面
 */

import { createCallbackRouteHandler } from "@nihplod/sso-sdk/next";

export const runtime = "nodejs";

// 与 middleware 保持一致：本地 HTTP 开发开启 insecureLocalDev
const isHttpLocalDev = (process.env.SSO_REDIRECT_URI || "").startsWith("http://");

export const GET = createCallbackRouteHandler({
  clientId: process.env.SSO_CLIENT_ID || "your-client-id",
  clientSecret: process.env.SSO_CLIENT_SECRET,
  ssoBaseUrl: process.env.SSO_BASE_URL || "https://nihplod.cn",
  redirectUri: process.env.SSO_REDIRECT_URI || "http://localhost:3002/api/auth/callback",
  insecureLocalDev: isHttpLocalDev,
});
