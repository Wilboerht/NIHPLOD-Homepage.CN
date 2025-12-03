/**
 * 认证逻辑
 * 服务端认证验证和会话管理
 */
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { verifyToken, type AdminJWTPayload } from "./jwt";
import { AUTH_COOKIE_NAME, type AdminUser } from "@/types/auth";

/**
 * 从 Cookie 中获取当前登录用户
 * 用于 Server Components 和 Server Actions
 */
export async function getCurrentUser(): Promise<AdminUser | null> {
  const cookieStore = await cookies();
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
  };
}

/**
 * 从请求中获取 Token
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
 * 验证请求中的认证信息
 * 用于 API 路由
 */
export async function verifyAuth(request: NextRequest): Promise<AdminJWTPayload | null> {
  const token = getTokenFromRequest(request);
  if (!token) {
    return null;
  }

  return verifyToken(token);
}

/**
 * API 路由保护高阶函数
 * 包装 API 处理函数，自动验证认证
 */
export function withAuth<T extends NextRequest>(
  handler: (request: T, admin: AdminJWTPayload) => Promise<Response>
): (request: T) => Promise<Response> {
  return async (request: T) => {
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
      );
    }

    return handler(request, admin);
  };
}

/**
 * 检查用户是否已认证
 * 用于客户端状态检查
 */
export async function isAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser();
  return user !== null;
}
