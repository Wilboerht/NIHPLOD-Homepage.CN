/**
 * Next.js 中间件
 * 保护管理后台路由，验证认证状态
 */
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// Cookie 名称
const AUTH_COOKIE_NAME = "admin_token";

// JWT 密钥
const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-secret-key-change-in-production-32chars"
);

// 需要保护的页面路径（管理后台）
const PROTECTED_PATHS = ["/admin"];

// 公开的管理后台页面路径（登录页）
const PUBLIC_ADMIN_PATHS = ["/admin-login"];

// ================= API 安全策略配置 =================

// 1. 敏感 API: 必须全权鉴权 (GET/POST/PUT/DELETE)
const SENSITIVE_API_PREFIXES = [
  "/api/admin/me",
  "/api/admin/logout",
  "/api/settings",
  "/api/dashboard",
];

// 2. 混合 API: GET 公开，写操作 (POST/PUT/DELETE) 需鉴权
const _HYBRID_API_PREFIXES = [
  "/api/categories",
  "/api/products",
  "/api/pages",
  "/api/media", // 注意：上传文件通常是 POST，查询文件是 GET
  "/api/jobs",
  "/api/application-folders",
  "/api/lottery-activity",
];

// 3. 完全公开 API: 任何方法都放行
const PUBLIC_API_PREFIXES = [
  "/api/admin/login",  // 登录接口
  "/api/contact",      // 用户留言
  "/api/careers/apply",// 职位申请
  "/api/advisor",      // AI 顾问全套接口
  "/api/oss/sign",     // OSS 签名 (已有 RateLimit 保护)
];

/**
 * 验证 JWT Token
 */
async function verifyToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}

/**
 * 检查路径是否匹配列表中的任一前缀
 */
function matchesPath(pathname: string, paths: string[]): boolean {
  return paths.some((path) => pathname.startsWith(path));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // 获取 Token
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  // 懒惰验证：只有在需要鉴权时才进行 verifyToken，节省 CPU
  const checkAuth = async () => token ? await verifyToken(token) : false;

  // ================= 1. 页面路由保护 =================

  // 1.1 登录页逻辑: 已登录用户访问登录页 -> 重定向到后台
  if (matchesPath(pathname, PUBLIC_ADMIN_PATHS)) {
    if (token && await checkAuth()) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return NextResponse.next();
  }

  // 1.2 管理后台页面逻辑: 未登录访问后台 -> 重定向到登录页
  if (matchesPath(pathname, PROTECTED_PATHS)) {
    if (!token || !(await checkAuth())) {
      const loginUrl = new URL("/admin-login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // ================= 2. API 路由保护 =================

  // 如果路径不是 /api 开头，直接放行
  if (!pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // 2.1 显式公开的 API -> 放行
  if (matchesPath(pathname, PUBLIC_API_PREFIXES)) {
    return NextResponse.next();
  }

  // 2.2 敏感 API -> 严查
  if (matchesPath(pathname, SENSITIVE_API_PREFIXES)) {
    if (!token || !(await checkAuth())) {
      return jsonUnauthorized();
    }
    return NextResponse.next();
  }

  // 2.3 混合 API 及其他未知 API -> 保护写操作
  // 策略：Secure by Default。对于未明确定义的 API，默认只开放 GET。
  // 如果在混合列表里，或者根本不在任何列表里，只要是写操作，就必须查 Token。

  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    // 写操作 (POST/PUT/DELETE/PATCH)
    if (!token || !(await checkAuth())) {
      return jsonUnauthorized();
    }
  }

  // GET 请求默认放行（针对混合 API 和未定义 API）
  return NextResponse.next();
}

/** 返回 401 JSON */
function jsonUnauthorized() {
  return NextResponse.json(
    { success: false, error: { code: "UNAUTHORIZED", message: "未授权管理员访问" } },
    { status: 401 }
  );
}

// 配置中间件匹配的路径
export const config = {
  matcher: [
    // 页面
    "/admin/:path*",
    "/admin-login",
    // API: 匹配所有 API 以便实施统一安全策略
    "/api/:path*",
  ],
};
