/**
 * 认证逻辑
 * 服务端认证验证和会话管理
 */
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { verifyToken, verifyUserToken } from "./jwt";
import { validateCSRFToken, csrfForbiddenResponse } from "./csrf";
import {
  AUTH_COOKIE_NAME,
  USER_COOKIE_NAME,
  type AdminUser,
  type UserInfo,
  type AdminJWTPayload,
  type UserJWTPayload,
} from "@/types/auth";
import { prisma } from "./prisma";
import type { UserStatus, AdminStatus } from "@/generated/prisma/client";
import { isTokenBlacklisted } from "@/lib/token-blacklist";
import { rateLimit, getClientIP } from "@/lib/ratelimit";

const CSRF_SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// ============================================
// 管理员认证
// ============================================

/**
 * 检查管理员账号是否有效
 */
function isAdminActive(status: AdminStatus, deletedAt: Date | null): boolean {
  return status === "ACTIVE" && deletedAt === null;
}

/**
 * 从 Cookie 中获取当前登录管理员
 * 用于 Server Components 和 Server Actions
 */
export async function getCurrentAdmin(): Promise<AdminUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return null;
  }

  // 校验管理员是否仍存在且未被禁用/删除
  const admin = await prisma.admin.findUnique({
    where: { id: payload.id },
    select: { id: true, email: true, name: true, role: true, status: true, deletedAt: true },
  });

  if (!admin || !isAdminActive(admin.status, admin.deletedAt)) {
    return null;
  }

  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
  };
}

/**
 * 从请求中获取管理员 Token
 * 支持 Cookie 和 Authorization Header
 */
export function getTokenFromRequest(request: NextRequest): string | null {
  // 优先从 Cookie 获取
  const cookieToken = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (cookieToken) {
    return cookieToken;
  }

  // 回退到 Authorization Header
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  return null;
}

/**
 * 验证请求中的管理员认证信息
 * 用于 API 路由；对非安全方法自动校验 CSRF Token。
 */
export async function verifyAuth(request: NextRequest): Promise<AdminJWTPayload | null> {
  const method = request.method?.toUpperCase() ?? "";
  if (!CSRF_SAFE_METHODS.has(method) && !validateCSRFToken(request)) {
    return null;
  }

  const token = getTokenFromRequest(request);
  if (!token) {
    return null;
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return null;
  }

  // 验证管理员是否仍存在且未被禁用/删除
  const admin = await prisma.admin.findUnique({
    where: { id: payload.id },
    select: { id: true, email: true, name: true, role: true, status: true, deletedAt: true },
  });

  if (!admin || !isAdminActive(admin.status, admin.deletedAt)) {
    return null;
  }

  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
  };
}

/**
 * API 路由保护高阶函数（管理员）
 * 包装 API 处理函数，自动验证认证
 * 支持 Next.js App Router Route Context
 */
export function withAuth<T extends NextRequest, C = unknown, R extends Response = Response>(
  handler: (request: T, admin: AdminJWTPayload, context: C) => Promise<R>
): (request: T, context: C) => Promise<R> {
  return async (request: T, context: C) => {
    const method = request.method?.toUpperCase() ?? "";
    if (!CSRF_SAFE_METHODS.has(method) && !validateCSRFToken(request)) {
      return csrfForbiddenResponse() as unknown as R;
    }

    const admin = await verifyAuth(request);

    if (!admin) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "未授权访问",
          },
        },
        { status: 401 }
      ) as unknown as R;
    }

    return handler(request, admin, context);
  };
}

/**
 * 基于角色的 API 路由保护高阶函数
 * 在认证基础上增加角色权限校验
 * 支持 Next.js App Router Route Context
 */
export function withRole<T extends NextRequest, C = unknown, R extends Response = Response>(
  allowedRoles: string[],
  handler: (request: T, admin: AdminJWTPayload, context: C) => Promise<R>
): (request: T, context: C) => Promise<R> {
  return withAuth(async (request, admin, context) => {
    if (!allowedRoles.includes(admin.role)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "权限不足，无法执行此操作",
          },
        },
        { status: 403 }
      ) as unknown as R;
    }
    return handler(request, admin, context);
  });
}

// ============================================
// 管理端写操作安全增强
// ============================================

/**
 * 管理端写操作速率限制
 * 防止管理后台 API 被爆破或 DoS
 *
 * @param key 可选的限流 key 后缀，默认为 "admin-write"
 * @returns 通过时返回 null，超限时直接返回 429 Response
 */
export async function checkAdminRateLimit(
  request: NextRequest,
  key: string = "admin-write"
): Promise<NextResponse | null> {
  const ip = getClientIP(request);
  const result = await rateLimit(`${key}:${ip}`, "default", {
    maxRequests: 30,
    windowMs: 60 * 1000,
  });
  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "RATE_LIMITED", message: "操作过于频繁，请稍后再试" },
      },
      { status: 429 }
    );
  }
  return null;
}

// ============================================
// C端用户认证
// ============================================

/**
 * 从请求中获取用户 Token
 */
export function getUserTokenFromRequest(request: NextRequest): string | null {
  // 优先从 Cookie 获取
  const cookieToken = request.cookies.get(USER_COOKIE_NAME)?.value;
  if (cookieToken) {
    return cookieToken;
  }

  // 回退到 Authorization Header
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  return null;
}

/**
 * 检查用户账号状态
 */
export async function checkUserStatus(
  userId: string
): Promise<{ valid: boolean; status: UserStatus; reason?: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });

  if (!user) {
    return { valid: false, status: "BANNED" as UserStatus, reason: "用户不存在" };
  }

  if (user.status === "SUSPENDED") {
    return { valid: false, status: user.status, reason: "账号已被临时冻结" };
  }

  if (user.status === "BANNED") {
    return { valid: false, status: user.status, reason: "账号已被永久封禁" };
  }

  return { valid: true, status: user.status };
}

/**
 * 验证请求中的用户认证信息
 * 对非安全方法（POST/PUT/PATCH/DELETE）自动校验 CSRF Token。
 * 使用 Bearer Token 的请求天然防 CSRF，因此豁免 CSRF 校验。
 */
export async function verifyUserAuth(request: NextRequest): Promise<UserJWTPayload | null> {
  const method = request.method?.toUpperCase() ?? "";
  const authHeader = request.headers.get("authorization");
  const isBearerAuth = authHeader?.startsWith("Bearer ") ?? false;

  if (!CSRF_SAFE_METHODS.has(method) && !isBearerAuth && !validateCSRFToken(request)) {
    return null;
  }

  const token = getUserTokenFromRequest(request);
  if (!token) {
    return null;
  }

  const payload = await verifyUserToken(token);
  if (!payload) {
    return null;
  }

  // 校验账号状态
  const statusCheck = await checkUserStatus(payload.id);
  if (!statusCheck.valid) {
    return null;
  }

  // 校验 access token 黑名单（封禁后 15 分钟窗口期内的 token）
  const blacklisted = await isTokenBlacklisted(payload.id);
  if (blacklisted) {
    return null;
  }

  return payload;
}

/**
 * 从 Cookie 中获取当前登录用户（完整信息）
 */
export async function getCurrentLoginUser(): Promise<UserInfo | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(USER_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const payload = await verifyUserToken(token);
  if (!payload) {
    return null;
  }

  // 从数据库获取最新用户信息
  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    select: {
      id: true,
      phone: true,
      nickname: true,
      avatar: true,
      status: true,
    },
  });

  if (!user || user.status !== "ACTIVE") {
    return null;
  }

  // 检查 access token 黑名单
  const blacklisted = await isTokenBlacklisted(payload.id);
  if (blacklisted) {
    return null;
  }

  return user;
}

/**
 * API 路由保护高阶函数（C端用户）
 */
export function withUserAuth<T extends NextRequest>(
  handler: (request: T, user: UserJWTPayload) => Promise<Response>
): (request: T) => Promise<Response> {
  return async (request: T) => {
    const method = request.method?.toUpperCase() ?? "";
    const authHeader = request.headers.get("authorization");
    const isBearerAuth = authHeader?.startsWith("Bearer ") ?? false;

    if (!CSRF_SAFE_METHODS.has(method) && !isBearerAuth && !validateCSRFToken(request)) {
      return csrfForbiddenResponse();
    }

    const user = await verifyUserAuth(request);

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "请先登录",
          },
        },
        { status: 401 }
      );
    }

    return handler(request, user);
  };
}
