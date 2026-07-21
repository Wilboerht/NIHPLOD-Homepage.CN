/**
 * @deprecated 此文件已被 src/middleware.ts 取代。
 * Next.js 中间件必须命名为 middleware.ts 并导出 middleware 函数。
 * 此文件保留仅供历史参考，后续版本将删除。
 *
 * 迁移时间: 2026-07-21
 * 替换文件: src/middleware.ts
 */
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// Cookie 名称（必须与 src/types/auth.ts 中的 AUTH_COOKIE_NAME 保持一致）
const AUTH_COOKIE_NAME = "__Host-admin_token";

// JWT 密钥（与 src/lib/jwt.ts 保持一致：优先 JWT_ADMIN_SECRET，回退 JWT_SECRET）
function getSecret(): Uint8Array {
  const jwtSecret = process.env.JWT_ADMIN_SECRET || process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error("[Proxy] JWT_SECRET / JWT_ADMIN_SECRET 环境变量未设置，请配置后再启动应用");
  }
  return new TextEncoder().encode(jwtSecret);
}

// 需要保护的页面路径（管理后台）
const PROTECTED_PATHS = ["/admin"];

// 公开的管理后台页面路径（登录页）
const PUBLIC_ADMIN_PATHS = ["/admin-login"];

// ================= API 安全策略配置 =================

// 1. 敏感 API: 必须全权鉴权 (GET/POST/PUT/DELETE)
const SENSITIVE_API_PREFIXES = [
  "/api/admin/", // 统一拦截所有 /api/admin/ 下的接口，实现严格的全范围防护
];

// 2. 完全公开 API: 任何方法都写放行 (这些路由内部会使用 verifyUserAuth 鉴权或白名单机制)
const PUBLIC_API_PREFIXES = [
  "/api/admin/login", // 登录接口
  "/api/contact", // 用户留言
  "/api/careers/apply", // 职位申请
  "/api/oss/sign", // OSS 签名 (已有 RateLimit 保护)
  // C端用户系统 — 自带 verifyUserAuth 鉴权，不走 admin_token
  "/api/auth/", // 用户认证（登录、注册、验证码、微信）
  "/api/user/", // 用户业务（资料、地址、优惠券）
  // 电商核心购买链路
  "/api/cart",
  "/api/checkout",
  "/api/orders",
  "/api/pay",
  "/api/wechat",
  "/api/coupons",
  "/api/coupons/public",
  "/api/revalidate",
  // 子站内部 API（由路由层 INTERNAL_API_SECRET / 签名鉴权，不走 admin_token）
  "/api/internal/",
  "/api/v1/internal/",
];

/**
 * 验证 JWT Token（中间件层）
 * 仅校验签名和过期时间，详细的 type 校验由 API 路由二次确认
 */
async function verifyToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    // 中间件层也做基本的 admin type 校验，防止依赖遗漏
    return (payload as Record<string, unknown>).type === "admin";
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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // 调试日志仅开发环境输出
  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[Middleware Debug] pathname=${pathname}, method=${method}, cookieName=${AUTH_COOKIE_NAME}`
    );
    const allCookies = request.cookies.getAll();
    console.log(
      `[Middleware Debug] all cookies: ${allCookies.map((c) => c.name).join(", ") || "(none)"}`
    );
  }

  // 获取 Token
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  // 懒惰验证：只有在需要鉴权时才进行 verifyToken，节省 CPU
  // 同一请求内记忆化结果，避免重复验证
  let _authResult: boolean | undefined;
  const checkAuth = async () =>
    _authResult ?? (_authResult = token ? await verifyToken(token) : false);

  // ================= 1. 页面路由保护 =================

  // 1.1 登录页逻辑: 已登录用户访问登录页 -> 重定向到后台
  if (matchesPath(pathname, PUBLIC_ADMIN_PATHS)) {
    if (token && (await checkAuth())) {
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
    // 对支付回调路由增加额外安全限制：只允许 POST（防止 GET/HEAD 探测）
    const PAYMENT_CALLBACK_PATHS = [
      "/api/pay/notify",
      "/api/pay/alipay-notify",
      "/api/pay/alipay-refund-notify",
      "/api/pay/refund-notify",
    ];
    if (matchesPath(pathname, PAYMENT_CALLBACK_PATHS)) {
      if (method !== "POST") {
        console.warn(`[Proxy] 支付回调路由 ${pathname} 收到非 POST 请求 (${method})，已拦截`);
        return new NextResponse("Method Not Allowed", { status: 405 });
      }
    }
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

// 配置代理匹配的路径
export const config = {
  matcher: [
    // 页面
    "/admin/:path*",
    "/admin-login",
    // API: 匹配所有 API 以便实施统一安全策略
    "/api/:path*",
  ],
};
