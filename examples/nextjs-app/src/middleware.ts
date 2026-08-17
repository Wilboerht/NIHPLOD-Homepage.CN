/**
 * Next.js Middleware — 使用 SSO SDK 保护所有路由
 *
 * 使用前请在 .env.local 中配置 SSO_CLIENT_ID / SSO_BASE_URL / SSO_REDIRECT_URI。
 * 本地开发若使用 HTTP，浏览器会拒绝 Secure Cookie（导致登录后 cookie 写不进去、
 * middleware 永远判定未登录而反复跳 SSO）；此时可设置 insecureLocalDev: true
 * （middleware/callback/logout 三处需同时开启），生产必须使用 HTTPS 且移除该配置。
 */
import { createSsoMiddleware } from "@nihplod/sso-sdk/next";

const clientSecret = process.env.SSO_CLIENT_SECRET;
if (!clientSecret && process.env.NODE_ENV === "production") {
  throw new Error("SSO_CLIENT_SECRET is required for Confidential Client in production");
}

// 本地 HTTP 开发（redirectUri 为 http:// 时）自动开启 insecureLocalDev
const isHttpLocalDev = (process.env.SSO_REDIRECT_URI || "").startsWith("http://");

const SSO_CONFIG = {
  clientId: process.env.SSO_CLIENT_ID || "your-client-id",
  clientSecret,
  ssoBaseUrl: process.env.SSO_BASE_URL || "https://nihplod.cn",
  redirectUri: process.env.SSO_REDIRECT_URI || "http://localhost:3002/api/auth/callback",
  scopes: "openid profile phone",
  publicPaths: ["/", "/api/auth/logout"],
  insecureLocalDev: isHttpLocalDev,
};

export const middleware = createSsoMiddleware(SSO_CONFIG);

export const config = {
  // 单一 matcher 已覆盖所有路径（含 /api/auth/*），无需额外项
  matcher: ["/((?!_next|favicon.ico).*)"],
};
