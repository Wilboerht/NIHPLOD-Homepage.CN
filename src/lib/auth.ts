/**
 * 认证逻辑
 * 服务端认证验证和会话管理
 */
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { verifyToken, verifyUserToken, type AdminJWTPayload, type UserJWTPayload } from "./jwt";
import { AUTH_COOKIE_NAME, USER_COOKIE_NAME, type AdminUser, type UserInfo } from "@/types/auth";
import { prisma } from "./prisma";

// ============================================
// 管理员认证
// ============================================

/**
 * 从 Cookie 中获取当前登录管理员
 * 用于 Server Components 和 Server Actions
 */
export async function getCurrentAdmin(): Promise<AdminUser | null> {
  const cookieStore = cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return null;
  }

  return {
    id: payload.id,
    email: payload.email,
    name: payload.name,
    role: payload.role,
  };
}

// 兼容旧接口
export const getCurrentUser = getCurrentAdmin;

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
 * 用于 API 路由
 */
export async function verifyAuth(request: NextRequest): Promise<AdminJWTPayload | null> {
  const token = getTokenFromRequest(request);
  if (!token) {
    return null;
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return null;
  }

  // 验证管理员是否仍存在且未被禁用
  const admin = await prisma.admin.findUnique({
    where: { id: payload.id },
    select: { id: true, email: true, name: true, role: true },
  });

  if (!admin) {
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
    const admin = await verifyAuth(request);

    if (!admin) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "未授权访问",
          },
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      ) as R;
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
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "权限不足，无法执行此操作",
          },
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      ) as R;
    }
    return handler(request, admin, context);
  });
}

/**
 * 检查管理员是否已认证
 */
export async function isAuthenticated(): Promise<boolean> {
  const user = await getCurrentAdmin();
  return user !== null;
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
 * 验证请求中的用户认证信息
 */
export async function verifyUserAuth(request: NextRequest): Promise<UserJWTPayload | null> {
  const token = getUserTokenFromRequest(request);
  if (!token) {
    return null;
  }

  return verifyUserToken(token);
}

/**
 * 从 Cookie 中获取当前登录用户（完整信息）
 */
export async function getCurrentLoginUser(): Promise<UserInfo | null> {
  const cookieStore = cookies();
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
    },
  });

  return user;
}

/**
 * API 路由保护高阶函数（C端用户）
 */
export function withUserAuth<T extends NextRequest>(
  handler: (request: T, user: UserJWTPayload) => Promise<Response>
): (request: T) => Promise<Response> {
  return async (request: T) => {
    const user = await verifyUserAuth(request);

    if (!user) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "请先登录",
          },
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return handler(request, user);
  };
}
