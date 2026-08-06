/**
 * Next.js Middleware
 * 保护管理后台路由和 API，验证认证状态，并为所有 HTML 响应生成 CSP nonce。
 *
 * 中间件在 Edge Runtime 中运行，早于所有 API 路由和页面渲染，
 * 提供纵深防御层：token 校验 / admin 页面重定向 / 支付回调方法限制 / 敏感 API 拦截 / CSP nonce。
 */
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const AUTH_COOKIE_NAME = "__Host-admin_token";

function getSecret(): Uint8Array {
  const jwtSecret = process.env.JWT_ADMIN_SECRET;
  if (!jwtSecret) {
    throw new Error(
      "[Middleware] JWT_ADMIN_SECRET 环境变量未设置，请配置后再启动应用"
    );
  }
  return new TextEncoder().encode(jwtSecret);
}

const PROTECTED_PATHS = ["/admin"];
const PUBLIC_ADMIN_PATHS = ["/admin-login"];

const SENSITIVE_API_PREFIXES = ["/api/admin/"];

const PUBLIC_API_PREFIXES = [
  "/api/admin/login",
  "/api/contact",
  "/api/careers/apply",
  "/api/oss/sign",
  "/api/auth/",
  "/api/user/",
  "/api/cart/",
  "/api/checkout/",
  "/api/orders/",
  "/api/pay/",
  "/api/wechat/",
  "/api/coupons/",
  "/api/revalidate",
  "/api/internal/",
  "/api/v1/internal/",
  "/api/oauth/",
  "/api/account/",
  "/login",
  "/logout",
];

async function verifyToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return (payload as Record<string, unknown>).type === "admin";
  } catch {
    return false;
  }
}

/**
 * 路径匹配：支持精确匹配和前缀匹配两种模式
 * - 以 "/" 结尾的路径 → 前缀匹配（pathname.startsWith）
 * - 不以 "/" 结尾的路径 → 精确匹配（pathname === path）
 *
 * 此设计防止前缀匹配过于宽泛的问题（如 "/api/admin/login" 误匹配 "/api/admin/login-attempt"）
 */
function matchesPath(pathname: string, paths: string[]): boolean {
  return paths.some((path) =>
    path.endsWith("/") ? pathname.startsWith(path) : pathname === path
  );
}

// ================= CSP nonce 配置 =================

/** 静态资源/无需 CSP 的路径前缀 */
const STATIC_PATH_PREFIXES = [
  "/_next/",
  "/favicon",
  "/fonts/",
  "/images/",
  "/manifest.json",
  "/robots.txt",
  "/sitemap.xml",
];

function isStaticPath(pathname: string): boolean {
  return STATIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/") || pathname.startsWith("/.well-known/");
}

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function buildCspHeader(nonce: string): string {
  const isDev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    // script-src 已移除 'unsafe-inline'；通过 per-request nonce 放行受控内联脚本
    // 'strict-dynamic' 允许受信脚本加载后续脚本（如 GTM/GA/高德）
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${
      isDev ? "'unsafe-eval'" : ""
    } https://static.cloudflareinsights.com https://*.amap.com https://www.googletagmanager.com https://hm.baidu.com blob:`,
    // Trusted Types：阻止 DOM XSS（innerHTML / document.write 注入）
    "require-trusted-types-for 'script'",
    // style-src 仍保留 'unsafe-inline'：项目中存在少量动态生成的内联样式与高德地图样式，
    // 完全移除需逐步重构，当前作为已知债务保留并单独标注
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.amap.com",
    "img-src 'self' data: blob: https://**.nihplod.cn https://**.aliyuncs.com https://*.amap.com https://*.autonavi.com https://www.google-analytics.com https://www.googletagmanager.com https://hm.baidu.com",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https://geo.datav.aliyun.com https://cloudflareinsights.com https://*.amap.com https://*.autonavi.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://hm.baidu.com",
    "worker-src 'self' blob:",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "base-uri 'self'",
    "upgrade-insecure-requests",
  ]
    .join(";")
    .replace(/;+/g, ";")
    .replace(/;\s*$/, "");
}

/**
 * 为 HTML 响应注入 CSP nonce。
 * 仅对非静态、非 API 的 GET/HEAD 请求设置，避免影响 API/静态资源。
 */
function applyCspNonce(request: NextRequest, response: NextResponse): NextResponse {
  const { pathname } = request.nextUrl;
  const method = request.method;

  if (isStaticPath(pathname) || isApiPath(pathname)) {
    return response;
  }
  if (method !== "GET" && method !== "HEAD") {
    return response;
  }

  const nonce = generateNonce();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  // 必须同时改写 request 头，服务端组件才能通过 headers() 读取 nonce
  const rewritten = NextResponse.next({ request: { headers: requestHeaders } });
  rewritten.headers.set("x-nonce", nonce);
  rewritten.headers.set("Content-Security-Policy", buildCspHeader(nonce));

  return rewritten;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // 对静态资源直接放行，不附加 CSP 或认证逻辑
  if (isStaticPath(pathname)) {
    return NextResponse.next();
  }

  // CORS 预检：OAuth 路径的 OPTIONS 由各 route handler 自行处理
  // （route handler 中的 OPTIONS 处理器使用 getOAuthCorsHeaders 校验白名单，
  //   不再在此处反射任意 origin，避免预检绕过白名单）

  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[Middleware] pathname=${pathname}, method=${method}, cookie=${AUTH_COOKIE_NAME}`
    );
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  let _authResult: boolean | undefined;
  const checkAuth = async () =>
    _authResult ?? (_authResult = token ? await verifyToken(token) : false);

  // ================= 1. 页面路由保护 =================

  // 1.1 已登录用户访问登录页 → 重定向到后台
  if (matchesPath(pathname, PUBLIC_ADMIN_PATHS)) {
    if (token && (await checkAuth())) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return applyCspNonce(request, NextResponse.next());
  }

  // 1.2 未登录访问后台 → 重定向到登录页
  if (matchesPath(pathname, PROTECTED_PATHS)) {
    if (!token || !(await checkAuth())) {
      const loginUrl = new URL("/admin-login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return applyCspNonce(request, NextResponse.redirect(loginUrl));
    }
    return applyCspNonce(request, NextResponse.next());
  }

  // ================= 2. API 路由保护 =================

  if (!pathname.startsWith("/api")) {
    return applyCspNonce(request, NextResponse.next());
  }

  // 2.1 显式公开的 API → 放行
  if (matchesPath(pathname, PUBLIC_API_PREFIXES)) {
    const PAYMENT_CALLBACK_PATHS = [
      "/api/pay/notify",
      "/api/pay/alipay-notify",
      "/api/pay/alipay-refund-notify",
      "/api/pay/refund-notify",
    ];
    if (matchesPath(pathname, PAYMENT_CALLBACK_PATHS) && method !== "POST") {
      console.warn(`[Middleware] 支付回调 ${pathname} 收到非 POST 请求 (${method})，已拦截`);
      return new NextResponse("Method Not Allowed", { status: 405 });
    }
    // OAuth 路径的 CORS 由各 route handler 自行处理（getOAuthCorsHeaders 白名单校验）
    return NextResponse.next();
  }

  // 2.2 敏感 API → 全方法严查
  if (matchesPath(pathname, SENSITIVE_API_PREFIXES)) {
    if (!token || !(await checkAuth())) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权管理员访问" } },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  // 2.3 未知 API → Secure by Default：只放行 GET/HEAD/OPTIONS
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    if (!token || !(await checkAuth())) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权管理员访问" } },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/:path*",
  ],
};
