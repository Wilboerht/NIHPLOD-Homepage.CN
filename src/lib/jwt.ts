/**
 * JWT 工具
 * 使用 jose 库实现 JWT 签名和验证
 *
 * Token 策略：
 * - Admin Access Token：短期（默认 1 天），用于管理后台 API
 * - User Access Token：短期（15分钟），用于 C 端 API
 * - User Refresh Token：长期（30天），用于刷新双 Token
 * - Wechat Bind Token：短期（1小时），仅用于微信绑定流程
 *
 * 安全增强：
 * - 不同类型的 Token 使用不同 Secret（可独立轮换）
 * - 启动时校验 Secret 最小长度
 * - 签发时设置 issuer / audience
 * - 验证时校验 type 与 audience
 */
import { createHash } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { LRUCache } from "lru-cache";
import type { AdminJWTPayload, UserJWTPayload, RefreshTokenPayload, AdminRole } from "@/types/auth";

const ISSUER = process.env.NEXT_PUBLIC_APP_URL || "https://nihplod.cn";
const MIN_SECRET_LENGTH = 32;

function validateSecret(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`[JWT] ${name} 环境变量未设置，请配置后再启动应用`);
  }
  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `[JWT] ${name} 长度必须不少于 ${MIN_SECRET_LENGTH} 个字符，当前 ${value.length} 个字符`
    );
  }
  return value;
}

// 各类型 Token 的 Secret：支持独立配置，未配置时回退到 JWT_SECRET 以保持兼容
const adminSecret = new TextEncoder().encode(
  validateSecret("JWT_ADMIN_SECRET", process.env.JWT_ADMIN_SECRET || process.env.JWT_SECRET)
);
const accessSecret = new TextEncoder().encode(
  validateSecret("JWT_ACCESS_SECRET", process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET)
);
const refreshSecret = new TextEncoder().encode(
  validateSecret("JWT_REFRESH_SECRET", process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET)
);
const wechatBindSecret = new TextEncoder().encode(
  validateSecret(
    "JWT_WECHAT_BIND_SECRET",
    process.env.JWT_WECHAT_BIND_SECRET || process.env.JWT_SECRET
  )
);
const wechatExchangeSecret = new TextEncoder().encode(
  validateSecret(
    "JWT_WECHAT_EXCHANGE_SECRET",
    process.env.JWT_WECHAT_EXCHANGE_SECRET || process.env.JWT_SECRET
  )
);

// JWT 过期时间
const adminExpiresInRaw = process.env.JWT_EXPIRES_IN || "1d";
if (!/^\d+[smhd]$/.test(adminExpiresInRaw)) {
  throw new Error(
    `[JWT] JWT_EXPIRES_IN 格式非法：${adminExpiresInRaw}，应为数字+单位（如 1d、12h、60m、3600s）`
  );
}
const adminExpiresIn = adminExpiresInRaw;

// C端用户 Token 时间
const accessTokenExpiresIn = "15m"; // Access Token 15分钟
const refreshTokenExpiresIn = "30d"; // Refresh Token 30天
const wechatBindExpiresIn = "1h"; // 微信绑定临时 Token 1小时
const wechatExchangeExpiresIn = "10m"; // 子站微信 exchange Token 10分钟

function encodeSecret(secret: Uint8Array): Uint8Array {
  return secret;
}

// ============================================
// 管理员 Token
// ============================================

/**
 * 签发管理员 JWT Token
 */
export async function signToken(payload: {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
}): Promise<string> {
  const token = await new SignJWT({ ...payload, type: "admin" as const })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience("admin")
    .setExpirationTime(adminExpiresIn)
    .sign(encodeSecret(adminSecret));

  return token;
}

/**
 * 验证管理员 JWT Token
 */
export async function verifyToken(token: string): Promise<AdminJWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, encodeSecret(adminSecret), {
      issuer: ISSUER,
      audience: "admin",
    });
    // 确保是管理员 token，防止用户 token 被用于访问 admin API
    if ((payload as AdminJWTPayload & { type?: string }).type !== "admin") {
      return null;
    }
    return payload as AdminJWTPayload;
  } catch {
    return null;
  }
}

// ============================================
// C端用户 Token（双 Token 策略）
// ============================================

/**
 * 签发用户 Access Token（短期，15分钟）
 */
export async function signUserToken(payload: { id: string; phone: string }): Promise<string> {
  const token = await new SignJWT({ ...payload, type: "user" as const })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience("user")
    .setExpirationTime(accessTokenExpiresIn)
    .sign(encodeSecret(accessSecret));

  return token;
}

/**
 * 验证用户 Access Token
 */
export async function verifyUserToken(token: string): Promise<UserJWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, encodeSecret(accessSecret), {
      issuer: ISSUER,
      audience: "user",
    });
    // 确保是用户 token
    if ((payload as UserJWTPayload).type !== "user") {
      return null;
    }
    return payload as UserJWTPayload;
  } catch {
    return null;
  }
}

/**
 * 签发用户 Refresh Token（长期，30天）
 */
export async function signRefreshToken(payload: { id: string; phone: string }): Promise<string> {
  const token = await new SignJWT({ ...payload, type: "refresh" as const })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience("refresh")
    .setExpirationTime(refreshTokenExpiresIn)
    .sign(encodeSecret(refreshSecret));

  return token;
}

/**
 * 验证用户 Refresh Token
 */
export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, encodeSecret(refreshSecret), {
      issuer: ISSUER,
      audience: "refresh",
    });
    // 确保是 refresh token
    if ((payload as RefreshTokenPayload).type !== "refresh") {
      return null;
    }
    return payload as RefreshTokenPayload;
  } catch {
    return null;
  }
}

// ============================================
// 微信绑定临时 Token
// ============================================

export interface WechatBindPayload {
  type: "wechat_bind";
  openid: string;
  unionid?: string;
  nickname?: string;
  avatar?: string;
}

/**
 * 签发微信绑定临时 Token（1小时）
 */
export async function signWechatBindToken(
  payload: Omit<WechatBindPayload, "type">
): Promise<string> {
  const token = await new SignJWT({ ...payload, type: "wechat_bind" as const })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience("wechat-bind")
    .setExpirationTime(wechatBindExpiresIn)
    .sign(encodeSecret(wechatBindSecret));

  return token;
}

// ============================================
// 子站微信授权 Exchange Token（跨域场景）
// ============================================

/**
 * 已兑换的 wechat_exchange_token 内存黑名单。
 * 说明：
 * - key 为 token 的 SHA256 hash；
 * - TTL 15 分钟，超过 exchange token 本身的 10 分钟有效期；
 * - 兑换成功后立即写入，防止 token 被重放兑换多次；
 * - 多实例部署时不共享，建议后续迁移到 Redis 等分布式缓存。
 */
const usedWechatExchangeTokens = new LRUCache<string, number>({
  max: 5000,
  ttl: 15 * 60 * 1000,
});

function hashWechatExchangeToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isWechatExchangeTokenUsed(token: string): boolean {
  return usedWechatExchangeTokens.has(hashWechatExchangeToken(token));
}

export function markWechatExchangeTokenUsed(token: string): void {
  usedWechatExchangeTokens.set(hashWechatExchangeToken(token), Date.now());
}

export interface WechatExchangePayload {
  type: "wechat_exchange";
  openid: string;
  unionid?: string;
  nickname?: string;
  avatar?: string;
}

/**
 * 签发微信授权 exchange token（短期，用于跨子站传递微信授权信息）
 */
export async function signWechatExchangeToken(
  payload: Omit<WechatExchangePayload, "type">
): Promise<string> {
  const token = await new SignJWT({ ...payload, type: "wechat_exchange" as const })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience("wechat-exchange")
    .setExpirationTime(wechatExchangeExpiresIn)
    .sign(encodeSecret(wechatExchangeSecret));

  return token;
}

/**
 * 验证微信授权 exchange token
 */
export async function verifyWechatExchangeToken(
  token: string
): Promise<WechatExchangePayload | null> {
  try {
    const { payload } = await jwtVerify(token, encodeSecret(wechatExchangeSecret), {
      issuer: ISSUER,
      audience: "wechat-exchange",
    });
    if ((payload as { type?: string }).type !== "wechat_exchange") {
      return null;
    }
    if (isWechatExchangeTokenUsed(token)) {
      return null;
    }
    return payload as unknown as WechatExchangePayload;
  } catch {
    return null;
  }
}

/**
 * 验证微信绑定临时 Token
 */
export async function verifyWechatBindToken(token: string): Promise<WechatBindPayload | null> {
  try {
    const { payload } = await jwtVerify(token, encodeSecret(wechatBindSecret), {
      issuer: ISSUER,
      audience: "wechat-bind",
    });
    if ((payload as { type?: string }).type !== "wechat_bind") {
      return null;
    }
    return payload as unknown as WechatBindPayload;
  } catch {
    return null;
  }
}

/**
 * 获取 Token 过期时间戳（秒）
 * @param minutes 分钟数
 */
export function getTokenExpiresAt(minutes: number = 15): number {
  return Math.floor(Date.now() / 1000) + minutes * 60;
}

/**
 * 获取 Refresh Token 过期时间戳（秒，30天）
 */
export function getRefreshTokenExpiresAt(): number {
  return Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
}
