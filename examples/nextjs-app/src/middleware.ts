/**
 * Next.js Middleware — 使用 SSO SDK 保护所有路由
 *
 * ⚠️ 使用前请替换 SSO_CONFIG 为你的实际配置
 */
import { createSsoMiddleware } from "@nihplod/sso-sdk/next";

const SSO_CONFIG = {
  clientId: "your-client-id", // ← 替换
  ssoBaseUrl: "https://nihplod.cn",
  redirectUri: "http://localhost:3002/api/auth/callback", // ← 替换
  scopes: "openid profile phone",
  publicPaths: ["/", "/login"],
};

export const middleware = createSsoMiddleware(SSO_CONFIG);

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};
