/**
 * Next.js Middleware
 * 保护管理后台路由和 API，验证认证状态
 *
 * 中间件在 Edge Runtime 中运行，早于所有 API 路由和页面渲染，
 * 提供纵深防御层：token 校验 / admin 页面重定向 / 支付回调方法限制 / 敏感 API 拦截。
 */
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const AUTH_COOKIE_NAME = "__Host-admin_token";

function getSecret(): Uint8Array {
  const jwtSecret = process.env.JWT_ADMIN_SECRET || process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error(
      "[Middleware] JWT_SECRET / JWT_ADMIN_SECRET 环境变量未设置，请配置后再启动应用"
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
  "/api/cart",
  "/api/checkout",
  "/api/orders",
  "/api/pay",
  "/api/wechat",
  "/api/coupons",
  "/api/coupons/public",
  "/api/revalidate",
  "/api/internal/",
  "/api/v1/internal/",
];

async function verifyToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return (payload as Record<string, unknown>).type === "admin";
  } catch {
    return false;
  }
}

function matchesPath(pathname: string, paths: string[]): boolean {
  return paths.some((path) => pathname.startsWith(path));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

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
    return NextResponse.next();
  }

  // 1.2 未登录访问后台 → 重定向到登录页
  if (matchesPath(pathname, PROTECTED_PATHS)) {
    if (!token || !(await checkAuth())) {
      const loginUrl = new URL("/admin-login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // ================= 2. API 路由保护 =================

  if (!pathname.startsWith("/api")) {
    return NextResponse.next();
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
    "/admin/:path*",
    "/admin-login",
    "/api/:path*",
  ],
};
