/**
 * Next.js Middleware
 * 保护管理后台路由和 API，验证认证状态，并为所有 HTML 响应生成 CSP nonce。
 *
 * 中间件在 Edge Runtime 中运行，早于所有 API 路由和页面渲染，
 * 提供纵深防御层：token 校验 / admin 页面重定向 / 敏感 API 拦截 / CSP nonce。
 */
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getIssuer } from "@/lib/oauth-constants";
import { getBodyLimitForPath, hasRequestBody } from "@/lib/body-limits";

const AUTH_COOKIE_NAME = "__Host-admin_token";
const CSRF_COOKIE_NAME = "__Host-csrf_token";
const CSRF_HEADER_NAME = "X-CSRF-Token";
const CSRF_SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * 管理端写操作的 CSRF 前置校验（纵深防御）。
 * 路由层仍会再次校验；这里保证即使某个 route 忘记校验，也不会静默放行。
 */
function hasValidCsrf(request: NextRequest): boolean {
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  return Boolean(headerToken && cookieToken && headerToken === cookieToken);
}

function getSecret(): Uint8Array {
  const jwtSecret = process.env.JWT_ADMIN_SECRET;
  if (!jwtSecret) {
    throw new Error("[Middleware] JWT_ADMIN_SECRET 环境变量未设置，请配置后再启动应用");
  }
  return new TextEncoder().encode(jwtSecret);
}

// "/admin" matches the dashboard exactly, "/admin/" prefix-matches all subpages
const PROTECTED_PATHS = ["/admin", "/admin/"];
const PUBLIC_ADMIN_PATHS = ["/admin-login", "/admin-login/"];

const SENSITIVE_API_PREFIXES = ["/api/admin/"];

/**
 * 由路由自身以专用密钥鉴权的服务端点（如 CRON_SECRET）：
 * middleware 直通，避免被 2.3「未知 API 需管理员 Cookie」误拦。
 */
const SECRET_API_PREFIXES = ["/api/cron/", "/api/baidu/"];

/** 管理员 SSO 服务端到服务端端点：用 client_secret 鉴权，不走 admin Cookie/CSRF */
const ADMIN_SSO_API_PATHS = new Set(["/api/admin/sso/token", "/api/admin/sso/status"]);

const PUBLIC_API_PREFIXES = [
  "/api/admin/login",
  "/api/admin/totp/recovery/",
  "/api/admin/sso/token",
  "/api/admin/sso/status",
  "/api/contact",
  "/api/careers/apply",
  "/api/oss/sign",
  "/api/auth/",
  "/api/user/",
  "/api/wechat/",
  "/api/revalidate",
  "/api/internal/",
  "/api/v1/internal/",
  "/api/oauth/",
  "/api/account/",
];

async function verifyToken(token: string): Promise<boolean> {
  try {
    // issuer 与 jwt.ts 签发侧保持一致（统一由 oauth-constants.getIssuer() 生成）
    const issuer = getIssuer();
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer,
      audience: "admin",
      algorithms: ["HS256"],
    });
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
  return paths.some((path) => (path.endsWith("/") ? pathname.startsWith(path) : pathname === path));
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
  "/llms.txt",
  "/llms-full.txt",
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

// 允许被配置的父窗口源嵌入（iframe）的页面路径白名单。
// 命中后 frame-ancestors 追加服务端环境变量 EMBED_ALLOWED_ORIGINS
// （逗号分隔 origin 列表；客户端白名单为 NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS，两者需保持一致）
const EMBEDDABLE_PATHS = ["/account/embed", "/privacy/embed", "/terms/embed"];

function isEmbeddablePath(pathname: string): boolean {
  return EMBEDDABLE_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function getOssImageOrigin(): string | null {
  const publicDomain = process.env.ALI_OSS_PUBLIC_DOMAIN;
  if (publicDomain) {
    try {
      return new URL(publicDomain).origin;
    } catch {
      // 配置非法时忽略，避免破坏整条 CSP
    }
  }
  const bucket = process.env.ALI_OSS_BUCKET;
  const region = process.env.ALI_OSS_REGION;
  if (bucket && region) return `https://${bucket}.${region}.aliyuncs.com`;
  return null;
}

function buildCspHeader(nonce: string, pathname: string): string {
  const isDev = process.env.NODE_ENV !== "production";

  let frameAncestors = "'self'";
  if (isEmbeddablePath(pathname)) {
    const embedOrigins = (process.env.EMBED_ALLOWED_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (embedOrigins.length > 0) {
      frameAncestors = `'self' ${embedOrigins.join(" ")}`;
    }
  }

  return [
    "default-src 'self'",
    // script-src 已移除 'unsafe-inline'；通过 per-request nonce 放行受控内联脚本
    // 'strict-dynamic' 允许受信脚本加载后续脚本（如 GTM/GA/高德）
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${
      isDev ? "'unsafe-eval'" : ""
    } https://static.cloudflareinsights.com https://*.amap.com https://www.googletagmanager.com https://hm.baidu.com blob:`,
    // Trusted Types 暂不启用：React 内部依赖 innerHTML（如 <style>/<title> 渲染），
    // 当前 React 对 Trusted Types 支持不完整，启用会导致 GlobalError 崩溃。
    // 待 React 完整支持后可重新评估。
    // "require-trusted-types-for 'script'",
    // style-src 仍保留 'unsafe-inline'：项目中存在少量动态生成的内联样式与高德地图样式，
    // 完全移除需逐步重构，当前作为已知债务保留并单独标注
    "style-src 'self' 'unsafe-inline' https://*.amap.com",
    // 注意：CSP 通配符只支持单 *（** 为无效源，浏览器会忽略整条规则）
    // 不再允许任意的 *.aliyuncs.com：只放行自有 OSS 公网域名，防止攻击者用其他 Bucket 做追踪像素。
    [
      "img-src 'self' data: blob: https://*.nihplod.cn",
      getOssImageOrigin(),
      "https://*.amap.com https://*.autonavi.com https://www.google-analytics.com https://www.googletagmanager.com https://hm.baidu.com",
    ]
      .filter(Boolean)
      .join(" "),
    "font-src 'self'",
    "connect-src 'self' https://geo.datav.aliyun.com https://cloudflareinsights.com https://*.amap.com https://*.autonavi.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://hm.baidu.com",
    "worker-src 'self' blob:",
    `frame-ancestors ${frameAncestors}`,
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

  // 重定向等非 next() 响应：直接附加安全头，保留状态码与 Location
  // （此前实现无条件返回 NextResponse.next()，导致未登录访问 /admin/** 的重定向被丢弃）
  if (response.headers.get("x-middleware-next") !== "1") {
    response.headers.set("x-nonce", nonce);
    response.headers.set("Content-Security-Policy", buildCspHeader(nonce, pathname));
    return response;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  // 必须同时改写 request 头，服务端组件才能通过 headers() 读取 nonce
  const rewritten = NextResponse.next({ request: { headers: requestHeaders } });
  rewritten.headers.set("x-nonce", nonce);
  rewritten.headers.set("Content-Security-Policy", buildCspHeader(nonce, pathname));

  return rewritten;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // 历史公开简历目录永久下线：即使迁移脚本尚未删除旧文件，也不能再通过公网访问。
  // 注意：已在 CDN/浏览器缓存的旧响应需按 docs/resume-storage.md 主动刷新缓存。
  if (pathname === "/uploads/resumes" || pathname.startsWith("/uploads/resumes/")) {
    return new NextResponse("Gone", {
      status: 410,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  // 对静态资源直接放行，不附加 CSP 或认证逻辑
  if (isStaticPath(pathname)) {
    return NextResponse.next();
  }

  // 请求体大小前置检查（Content-Length 快速拒绝）。
  // chunked 请求没有 Content-Length，由 route 层的 request-body helper 兜底。
  if (pathname.startsWith("/api/") && hasRequestBody(method)) {
    const contentLength = Number(request.headers.get("content-length") || 0);
    const limit = getBodyLimitForPath(pathname);
    if (Number.isFinite(contentLength) && contentLength > limit) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "PAYLOAD_TOO_LARGE",
            message: `请求体超过上限（${limit} 字节）`,
          },
        },
        { status: 413, headers: { "Cache-Control": "no-store" } }
      );
    }
  }

  // CORS 预检：OAuth 路径的 OPTIONS 由各 route handler 自行处理
  // （route handler 中的 OPTIONS 处理器使用 getOAuthCorsHeaders 校验白名单，
  //   不再在此处反射任意 origin，避免预检绕过白名单）

  if (process.env.NODE_ENV !== "production") {
    console.log(`[Middleware] pathname=${pathname}, method=${method}, cookie=${AUTH_COOKIE_NAME}`);
  }

  // 管理端写操作统一 CSRF 前置校验（登录端点自行校验 Origin + CSRF）
  if (
    pathname.startsWith("/api/admin/") &&
    pathname !== "/api/admin/login" &&
    !ADMIN_SSO_API_PATHS.has(pathname) &&
    !CSRF_SAFE_METHODS.has(method)
  ) {
    if (!hasValidCsrf(request)) {
      return NextResponse.json(
        { success: false, error: { code: "CSRF_INVALID", message: "CSRF 验证失败" } },
        { status: 403 }
      );
    }
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  let _authResult: boolean | undefined;
  const checkAuth = async () =>
    _authResult ?? (_authResult = token ? await verifyToken(token) : false);

  // ================= 1. 页面路由保护 =================

  // 1.1 已登录用户访问登录页 → 重定向到后台
  // reauth=1 例外：服务端已判定当前 token 失效（改密/改角色/删除/禁用），
  // 必须允许登录页渲染，否则会与 /admin 的失效重定向形成无限循环。
  if (matchesPath(pathname, PUBLIC_ADMIN_PATHS)) {
    const reauth = request.nextUrl.searchParams.get("reauth") === "1";
    if (!reauth && token && (await checkAuth())) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return applyCspNonce(request, NextResponse.next());
  }

  // 1.2 未登录访问后台 → 重定向到登录页
  if (matchesPath(pathname, PROTECTED_PATHS)) {
    if (!token || !(await checkAuth())) {
      const loginUrl = new URL("/admin-login", request.url);
      // 保留 query：管理员 SSO authorize 的 client_id/state/PKCE 都在 query 上，
      // 只传 pathname 会导致登录后被重定向到缺少参数的 authorize 端点。
      loginUrl.searchParams.set("redirect", pathname + request.nextUrl.search);
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
    // OAuth 路径的 CORS 由各 route handler 自行处理（getOAuthCorsHeaders 白名单校验）
    return NextResponse.next();
  }

  // 2.1b 专用密钥自鉴权端点（CRON_SECRET 等）→ 直通，由路由校验
  if (matchesPath(pathname, SECRET_API_PREFIXES)) {
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
  matcher: ["/:path*"],
};
