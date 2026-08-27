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
 * Cookie 配置
 *
 * 使用 __Host- 前缀要求：
 * - Secure 必须为 true
 * - Path 必须为 "/"
 * - 不能设置 Domain 属性
 * - localhost 在浏览器中同样被视为安全上下文，开发环境可用
 */
export const AUTH_COOKIE_NAME = "__Host-admin_token";

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
  sameSite: "strict" as const,
  path: "/",
  maxAge: parseDurationToSeconds(adminExpiresIn), // 与 JWT 过期时间保持一致，默认 1 天
};

// 微信 OAuth 防 CSRF nonce Cookie
// 使用 Lax 而非 Strict：微信 OAuth 回调是跨站 top-level navigation，
// Strict Cookie 不会被携带，用 Lax 确保 nonce 能在回调验证时被读取
export const WECHAT_NONCE_COOKIE_NAME = "__Host-wechat_oauth_nonce";

// 微信占位手机号前缀：微信登录创建账户时若未绑定手机号，使用此前缀
export const WECHAT_PLACEHOLDER_PHONE_PREFIX = "wx_";
export const WECHAT_NONCE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 10 * 60, // 10 分钟
};

// 抖音 OAuth 防 CSRF nonce Cookie（与微信同机制：Lax 兼容跨站顶级导航回调）
export const DOUYIN_NONCE_COOKIE_NAME = "__Host-douyin_oauth_nonce";
export const DOUYIN_NONCE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 10 * 60, // 10 分钟
};

// 微信绑定临时 Token Cookie
// 使用 Lax 以兼容从微信 OAuth 回调页面发起的请求（顶级导航携带 Cookie）
export const WECHAT_BIND_COOKIE_NAME = "__Host-wechat_bind_token";
export const WECHAT_BIND_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
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
  /**
   * @deprecated 已废弃：新签发的 token 不再携带明文手机号（防日志/子项目泄漏），
   * 仅为兼容本改动上线前签发的旧 token 而保留（旧 token 15 分钟内自然过期）。
   * 业务逻辑需要手机号时请按 id 查库（prisma.user.findUnique select phone），不要依赖此字段。
   */
  phone?: string;
  type: "user"; // 区分管理员和普通用户
  jti?: string; // token 唯一标识，用于单条 token 级别撤销
  /** 原始认证时间（Unix 秒）。refresh 换发时透传不重置，max_age 计算以 auth_time ?? iat 为准 */
  auth_time?: number;
}

/**
 * Refresh Token 载荷
 *
 * 安全增强：OAuth 2.0 场景下携带 client_id / scope，
 * 用于 refresh 流程校验 token 所有权，防止跨 client 复用 refresh token。
 * 内部非 OAuth 刷新 token 可不设置这两个字段，保持向后兼容。
 */
export interface RefreshTokenPayload extends JWTPayload {
  id: string;
  /**
   * @deprecated 已废弃：新签发的 refresh token 不再携带明文手机号（与 access token
   * 移除 phone 的方向一致，防日志/子项目泄漏），仅为兼容本改动上线前签发的旧 token
   * 而保留（旧 token 30 天内自然过期）。需要手机号时请按 id 查库
   * （prisma.user.findUnique select phone），不要依赖此字段。
   */
  phone?: string;
  type: "refresh";
  client_id?: string;
  scope?: string;
  /** 关联的 OAuthSession.sessionId，revoke 时据此定位单个会话撤销 */
  sid?: string;
  /** DPoP 绑定的 JWK Thumbprint（RFC 9449），refresh 时据此要求并验证 DPoP proof */
  dpop_jkt?: string;
  /** 原始认证时间（Unix 秒），refresh 换发时透传，跨轮换不丢失 */
  auth_time?: number;
}

/**
 * OAuth Access Token 载荷
 * 由 signOAuthAccessToken 签发，type="access_token"，与 C 端内部 UserToken 隔离
 */
export interface OAuthAccessTokenPayload extends JWTPayload {
  id: string;
  phone: string;
  type: "access_token";
  client_id: string;
  scope?: string;
  /** DPoP 绑定：RFC 9449 cnf.jkt (JWK Thumbprint) */
  cnf?: { jkt?: string };
  /** 关联的 OAuthSession.sessionId，验证时按此查会话状态实现撤销即时失效 */
  sid?: string;
}

/**
 * C端用户 Cookie 配置
 */
export const USER_COOKIE_NAME = "__Host-user_token";
export const USER_REFRESH_COOKIE_NAME = "__Host-user_refresh_token";

// Access Token Cookie：15 分钟，与 JWT 过期时间一致
// 使用 Lax 而非 Strict：微信/支付宝内嵌浏览器作为第三方上下文会拦截 Strict Cookie，
// 导致用户从微信内打开子站时无法维持登录状态。
// 安全考量：
// - Lax 模式下跨站 POST/PUT/DELETE 请求不会携带 Cookie，写操作天然受 CSRF 保护
// - 但跨站 GET 请求（顶级导航）会携带 Cookie，可能被用于 CSRF 读操作
// - 对此，关键 API 的写操作已有 CSRF Token（__Host-csrf_token + X-CSRF-Token Header）
//   通过 verifyUserAuth 函数强制执行，提供等效的写操作纵深防御
// - OAuth 授权端点使用 state 参数防 CSRF，不依赖 Cookie 的 SameSite 策略
export const USER_ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 15 * 60, // 15 分钟（秒）
};

// Refresh Token Cookie：30 天
export const USER_REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 30 * 24 * 60 * 60, // 30 天（秒）
};
