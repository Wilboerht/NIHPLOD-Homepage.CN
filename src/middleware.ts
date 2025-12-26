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

// 需要保护的路径（管理后台）
const PROTECTED_PATHS = ["/admin"];

// 公开的管理后台路径（登录页）
const PUBLIC_ADMIN_PATHS = ["/admin-login"];

// API 路由需要认证的路径前缀
const PROTECTED_API_PATHS = [
  "/api/admin/me",
  "/api/admin/logout",
  "/api/categories",
  "/api/pages",
  "/api/media",
  "/api/jobs",
  "/api/settings",
];

// 公开的 API 路径（不需要认证）
const _PUBLIC_API_PATHS = [
  "/api/admin/login",
  "/api/contact",
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

  // 获取 Token
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const isAuthenticated = token ? await verifyToken(token) : false;

  // 1. 处理管理后台页面路由
  if (matchesPath(pathname, PROTECTED_PATHS)) {
    // 未登录时重定向到管理员登录页
    if (!isAuthenticated) {
      const loginUrl = new URL("/admin-login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // 2. 已登录用户访问登录页，重定向到管理后台
  if (matchesPath(pathname, PUBLIC_ADMIN_PATHS)) {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
  }

  // 3. 保护的 API 路由检查
  if (matchesPath(pathname, PROTECTED_API_PATHS)) {
    if (!isAuthenticated) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "未授权访问",
          },
        },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

// 配置中间件匹配的路径
export const config = {
  matcher: [
    // 管理后台页面
    "/admin/:path*",
    "/admin-login",
    // 需要保护的 API 路由
    "/api/admin/:path*",
    "/api/categories/:path*",
    "/api/products/:path*",
    "/api/pages/:path*",
    "/api/media/:path*",
    "/api/jobs/:path*",
    "/api/settings/:path*",
  ],
};

