/**
 * 认证相关类型定义
 */

/**
 * 管理员用户信息
 */
export interface AdminUser {
  id: string;
  email: string;
  name: string;
}

/**
 * JWT Token 载荷
 */
export interface AdminJWTPayload {
  id: string;
  email: string;
  name: string;
  iat?: number; // 签发时间
  exp?: number; // 过期时间
}

/**
 * 登录请求数据
 */
export interface LoginCredentials {
  email: string;
  password: string;
}

/**
 * 登录响应数据
 */
export interface LoginResponse {
  success: boolean;
  data?: {
    user: AdminUser;
    expiresAt: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * 认证会话状态
 */
export interface AuthSession {
  user: AdminUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

/**
 * Cookie 配置
 */
export const AUTH_COOKIE_NAME = "admin_token";

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: 7 * 24 * 60 * 60, // 7 天（秒）
};

