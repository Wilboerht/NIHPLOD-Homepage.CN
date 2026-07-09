/**
 * 认证相关类型定义
 */
import type { JWTPayload } from "jose";

// ============================================
// 管理员认证（后台管理）
// ============================================

/**
 * 管理员角色
 */
export type AdminRole = "owner" | "admin";

/**
 * 管理员用户信息
 */
export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
}

/**
 * JWT Token 载荷
 */
export interface AdminJWTPayload extends JWTPayload {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
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
 *
 * 使用 __Host- 前缀要求：
 * - Secure 必须为 true
 * - Path 必须为 "/"
 * - 不能设置 Domain 属性
 * - localhost 在浏览器中同样被视为安全上下文，开发环境可用
 */
export const AUTH_COOKIE_NAME = "admin_token";

function parseDurationToSeconds(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return 24 * 60 * 60; // 非法格式默认 1 天
  const value = parseInt(match[1], 10);
  const unit = match[2] as "s" | "m" | "h" | "d";
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * multipliers[unit];
}

const adminExpiresIn = process.env.JWT_EXPIRES_IN || "1d";

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: parseDurationToSeconds(adminExpiresIn), // 与 JWT 过期时间保持一致，默认 1 天
};

// 微信 OAuth 防 CSRF nonce Cookie
export const WECHAT_NONCE_COOKIE_NAME = "__Host-wechat_oauth_nonce";
export const WECHAT_NONCE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "strict" as const,
  path: "/",
  maxAge: 10 * 60, // 10 分钟
};

// 微信绑定临时 Token Cookie
export const WECHAT_BIND_COOKIE_NAME = "__Host-wechat_bind_token";
export const WECHAT_BIND_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "strict" as const,
  path: "/",
  maxAge: 60 * 60, // 1 小时
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
}

/**
 * C端用户 JWT 载荷
 */
export interface UserJWTPayload extends JWTPayload {
  id: string;
  phone: string;
  type: "user"; // 区分管理员和普通用户
}

/**
 * Refresh Token 载荷
 */
export interface RefreshTokenPayload extends JWTPayload {
  id: string;
  phone: string;
  type: "refresh";
}

/**
 * 发送验证码请求
 */
export interface SendCodeRequest {
  phone: string;
  type?: "login" | "register" | "bind" | "reset";
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
export const USER_COOKIE_NAME = "__Host-user_token";
export const USER_REFRESH_COOKIE_NAME = "__Host-user_refresh_token";

// Access Token Cookie：15 分钟，与 JWT 过期时间一致
export const USER_ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "strict" as const,
  path: "/",
  maxAge: 15 * 60, // 15 分钟（秒）
};

// Refresh Token Cookie：30 天
export const USER_REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "strict" as const,
  path: "/",
  maxAge: 30 * 24 * 60 * 60, // 30 天（秒）
};

/** @deprecated 使用 USER_ACCESS_COOKIE_OPTIONS 或 USER_REFRESH_COOKIE_OPTIONS */
export const USER_COOKIE_OPTIONS = USER_ACCESS_COOKIE_OPTIONS;

