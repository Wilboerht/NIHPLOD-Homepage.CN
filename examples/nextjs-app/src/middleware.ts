/**
 * Next.js Middleware — 使用 SSO SDK 保护所有路由
 *
 * 使用前请在 .env.local 中配置 SSO_CLIENT_ID / SSO_BASE_URL / SSO_REDIRECT_URI。
 * 本地开发若使用 HTTP，浏览器会拒绝 Secure Cookie，建议仅用于演示；生产必须使用 HTTPS。
 */
import { createSsoMiddleware } from "@nihplod/sso-sdk/next";

const SSO_CONFIG = {
  clientId: process.env.SSO_CLIENT_ID || "your-client-id",
  clientSecret: process.env.SSO_CLIENT_SECRET,
  ssoBaseUrl: process.env.SSO_BASE_URL || "https://nihplod.cn",
  redirectUri: process.env.SSO_REDIRECT_URI || "https://localhost:3002/api/auth/callback",
  scopes: "openid profile phone",
  publicPaths: ["/", "/login", "/api/auth/logout"],
};

export const middleware = createSsoMiddleware(SSO_CONFIG);

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)", "/api/auth/:path*"],
};
