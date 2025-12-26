/**
 * 认证相关类型定义
 */

// ============================================
// 管理员认证（后台管理）
// ============================================

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

// ============================================
// C端用户认证（官网用户）
// ============================================

/**
 * C端用户信息
 */
export interface UserInfo {
  id: string;
  phone: string;
  nickname: string | null;
  avatar: string | null;
  points: number;
}

/**
 * C端用户 JWT 载荷
 */
export interface UserJWTPayload {
  id: string;
  phone: string;
  type: "user"; // 区分管理员和普通用户
  iat?: number;
  exp?: number;
}

/**
 * 发送验证码请求
 */
export interface SendCodeRequest {
  phone: string;
  type?: "login" | "bind" | "reset";
}

/**
 * 手机号登录请求
 */
export interface PhoneLoginRequest {
  phone: string;
  code: string;
}

/**
 * 用户登录响应
 */
export interface UserLoginResponse {
  success: boolean;
  data?: {
    user: UserInfo;
    isNewUser: boolean;
    expiresAt: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * C端用户 Cookie 配置
 */
export const USER_COOKIE_NAME = "user_token";

export const USER_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const, // 允许跨站请求携带（微信登录回调）
  path: "/",
  maxAge: 30 * 24 * 60 * 60, // 30 天（秒）
};

