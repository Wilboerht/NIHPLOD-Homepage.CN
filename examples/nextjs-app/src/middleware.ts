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

const isProduction = process.env.NODE_ENV === "production";
const redirectUri = process.env.SSO_REDIRECT_URI;

// 生产环境必须显式配置 https 回调地址：否则误配（缺省 localhost / http）会静默关闭
// Secure Cookie 与 __Host-/__Secure- 前缀，或在登录后反复跳转 SSO。
if (isProduction && (!redirectUri || !redirectUri.startsWith("https://"))) {
  throw new Error("生产环境必须配置 https:// 的 SSO_REDIRECT_URI");
}

// 本地 HTTP 开发（仅非生产环境且回调为 http://）自动开启 insecureLocalDev；
// 生产环境恒为 false（SDK 内部还有一道生产守卫兜底）。
const isHttpLocalDev = !isProduction && (redirectUri || "").startsWith("http://");

const SSO_CONFIG = {
  clientId: process.env.SSO_CLIENT_ID || "your-client-id",
  clientSecret,
  ssoBaseUrl: process.env.SSO_BASE_URL || "https://nihplod.cn",
  redirectUri: redirectUri || "http://localhost:3002/api/auth/callback",
  scopes: "openid profile phone",
  publicPaths: ["/", "/api/auth/logout"],
  insecureLocalDev: isHttpLocalDev,
};

export const middleware = createSsoMiddleware(SSO_CONFIG);

export const config = {
  // 单一 matcher 已覆盖所有路径（含 /api/auth/*），无需额外项
  matcher: ["/((?!_next|favicon.ico).*)"],
};
