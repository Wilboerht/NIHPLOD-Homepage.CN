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
import { SignJWT, jwtVerify, importPKCS8, importSPKI } from "jose";
import { LRUCache } from "lru-cache";
import { isAccessTokenRevoked } from "./token-blacklist";
import type { AdminJWTPayload, UserJWTPayload, RefreshTokenPayload, OAuthAccessTokenPayload, AdminRole } from "@/types/auth";

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

// 各类型 Token 的 Secret：必须独立配置，确保密钥隔离，禁止跨类型 Token 滥用
// 未配置时 validateSecret 会在启动时抛出错误，阻止应用启动
const adminSecret = new TextEncoder().encode(
  validateSecret("JWT_ADMIN_SECRET", process.env.JWT_ADMIN_SECRET)
);
const accessSecret = new TextEncoder().encode(
  validateSecret("JWT_ACCESS_SECRET", process.env.JWT_ACCESS_SECRET)
);
const refreshSecret = new TextEncoder().encode(
  validateSecret("JWT_REFRESH_SECRET", process.env.JWT_REFRESH_SECRET)
);
const wechatBindSecret = new TextEncoder().encode(
  validateSecret("JWT_WECHAT_BIND_SECRET", process.env.JWT_WECHAT_BIND_SECRET)
);
const wechatExchangeSecret = new TextEncoder().encode(
  validateSecret("JWT_WECHAT_EXCHANGE_SECRET", process.env.JWT_WECHAT_EXCHANGE_SECRET)
);
const idTokenSecret = new TextEncoder().encode(
  validateSecret("JWT_ID_TOKEN_SECRET", process.env.JWT_ID_TOKEN_SECRET)
);
const logoutSecret = new TextEncoder().encode(
  validateSecret("JWT_LOGOUT_SECRET", process.env.JWT_LOGOUT_SECRET)
);

// ============================================
// OAuth Access Token RS256 迁移支持（可选）
// ============================================

let cachedAccessPrivateKey: CryptoKey | null = null;
let cachedAccessPublicKey: CryptoKey | null = null;

function hasRS256AccessKeys(): boolean {
  return Boolean(process.env.JWT_ACCESS_PRIVATE_KEY && process.env.JWT_ACCESS_PUBLIC_KEY);
}

async function getAccessPrivateKey(): Promise<CryptoKey | null> {
  if (!process.env.JWT_ACCESS_PRIVATE_KEY) return null;
  if (cachedAccessPrivateKey) return cachedAccessPrivateKey;
  cachedAccessPrivateKey = await importPKCS8(process.env.JWT_ACCESS_PRIVATE_KEY, "RS256");
  return cachedAccessPrivateKey;
}

export async function getAccessPublicKey(): Promise<CryptoKey | null> {
  if (!process.env.JWT_ACCESS_PUBLIC_KEY) return null;
  if (cachedAccessPublicKey) return cachedAccessPublicKey;
  cachedAccessPublicKey = await importSPKI(process.env.JWT_ACCESS_PUBLIC_KEY, "RS256");
  return cachedAccessPublicKey;
}

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
const idTokenExpiresIn = "1h"; // OAuth ID Token 1小时
const logoutTokenExpiresIn = "5m"; // Logout Token 5分钟

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
 *
 * 用于 C 端用户内部 API（如 /api/user/profile、/api/cart 等）。
 * Token type="user"，audience="user"，仅供 verifyUserToken 验证。
 *
 * 与 OAuth Access Token 的区别：
 * - OAuth：type="access_token"，audience=clientId，由 signOAuthAccessToken 签发
 * - 内部：type="user"，audience="user"，由本函数签发
 * - 两者使用不同的 token type，verifyOAuthAccessToken 仅接受 access_token 类型
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
 *
 * @param token - JWT token 字符串
 * @param options - 可选配置
 * @param options.checkStatus - 可选状态检查回调，返回 true 表示用户状态正常
 */
export async function verifyUserToken(
  token: string,
  options?: { checkStatus?: (userId: string) => Promise<boolean> }
): Promise<UserJWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, encodeSecret(accessSecret), {
      issuer: ISSUER,
      audience: "user",
    });
    // 确保是用户 token
    if ((payload as UserJWTPayload).type !== "user") {
      return null;
    }

    // 可选：实时状态检查
    if (options?.checkStatus) {
      const userId = (payload as UserJWTPayload).id;
      const isActive = await options.checkStatus(userId);
      if (!isActive) {
        return null;
      }
    }

    return payload as UserJWTPayload;
  } catch {
    return null;
  }
}

/**
 * 签发用户 Refresh Token（长期，30天）
 *
 * @param payload.clientId - OAuth client_id，可选。传入时写入 payload，用于 refresh 时校验所有权。
 * @param payload.scope - 授权 scope，可选。传入时写入 payload，便于后续审计与最小权限校验。
 */
export async function signRefreshToken(payload: {
  id: string;
  phone: string;
  clientId?: string;
  scope?: string;
}): Promise<string> {
  const jwtPayload: Record<string, unknown> = {
    id: payload.id,
    phone: payload.phone,
    type: "refresh" as const,
  };
  // 仅在传入时写入，保持内部非 OAuth token 的向后兼容
  if (payload.clientId) jwtPayload.client_id = payload.clientId;
  if (payload.scope) jwtPayload.scope = payload.scope;

  const token = await new SignJWT(jwtPayload)
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

// ============================================
// OAuth ID Token
// ============================================

export interface IdTokenClaims {
  sub: string;
  aud: string;
  phone?: string;
  nickname?: string;
  avatar?: string;
  membershipLevel?: string;
  totalPoints?: number;
  scope?: string;
  /** OIDC Core 3.3.2.11: Access Token 的 SHA-256 左半 base64url */
  at_hash?: string;
}

/**
 * 计算 OIDC at_hash 声明
 * OIDC Core 3.3.2.11: access_token 的 SHA-256 哈希左半部分（128 bits）的 base64url 编码
 */
export function computeAtHash(accessToken: string): string {
  const hash = createHash("sha256").update(accessToken).digest();
  return Buffer.from(hash.subarray(0, hash.length / 2)).toString("base64url");
}

/**
 * 签发 OIDC ID Token（1小时）
 */
export async function signIdToken(claims: IdTokenClaims): Promise<string> {
  const token = await new SignJWT({ ...claims, type: "id_token" as const })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(claims.aud)
    .setSubject(claims.sub)
    .setJti(crypto.randomUUID())
    .setExpirationTime(idTokenExpiresIn)
    .sign(encodeSecret(idTokenSecret));

  return token;
}

/**
 * 验证 ID Token
 */
export async function verifyIdToken(token: string, audience: string): Promise<IdTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, encodeSecret(idTokenSecret), {
      issuer: ISSUER,
      audience,
    });
    if ((payload as { type?: string }).type !== "id_token") {
      return null;
    }
    return payload as unknown as IdTokenClaims;
  } catch {
    return null;
  }
}

// ============================================
// OAuth Logout Token (Backchannel Logout)
// ============================================

export interface LogoutTokenClaims {
  sub: string;
  aud: string;
  events: string;
  jti: string;
}

/**
 * 签发 Logout Token（5分钟，用于 backchannel logout）
 */
export async function signLogoutToken(claims: LogoutTokenClaims): Promise<string> {
  const token = await new SignJWT({ ...claims, type: "logout_token" as const })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(claims.aud)
    .setSubject(claims.sub)
    .setJti(claims.jti || crypto.randomUUID())
    .setExpirationTime(logoutTokenExpiresIn)
    .sign(encodeSecret(logoutSecret));

  return token;
}

/**
 * 验证 Logout Token
 */
export async function verifyLogoutToken(token: string, audience: string): Promise<LogoutTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, encodeSecret(logoutSecret), {
      issuer: ISSUER,
      audience,
    });
    if ((payload as { type?: string }).type !== "logout_token") {
      return null;
    }
    return payload as unknown as LogoutTokenClaims;
  } catch {
    return null;
  }
}

// ============================================
// OAuth Access Token（带 OAuth claims 的 C 端 Token）
// ============================================

/**
 * 签发 OAuth Access Token（短期，15分钟，含 OAuth claims）
 *
 * 用于 OAuth 2.0 授权码流程，由 /api/oauth/token 端点签发。
 * Token type="access_token"，audience=clientId（按子项目隔离）。
 * 子项目可使用此 token 调用 /api/oauth/userinfo 或通过 JWKS 本地验证。
 *
 * 与内部用户 Access Token 的区别：
 * - OAuth：type="access_token"，audience=clientId，含 scope/client_id claims
 * - 内部：type="user"，audience="user"，由 signUserToken 签发
 * - verifyOAuthAccessToken 仅接受 access_token 类型，确保 OAuth 端点不泄漏内部 token
 */
export async function signOAuthAccessToken(payload: {
  id: string;
  phone: string;
  clientId: string;
  scope: string;
}): Promise<string> {
  const jwt = new SignJWT({
    id: payload.id,
    phone: payload.phone,
    client_id: payload.clientId,
    scope: payload.scope,
    type: "access_token" as const,
  })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(payload.clientId)
    .setJti(crypto.randomUUID())
    .setExpirationTime(accessTokenExpiresIn);

  // 若配置了 RS256 密钥对，优先使用非对称签名；否则回退 HS256
  const rs256PrivateKey = await getAccessPrivateKey();
  if (rs256PrivateKey) {
    jwt.setProtectedHeader({ alg: "RS256", typ: "JWT" });
    return jwt.sign(rs256PrivateKey);
  }

  jwt.setProtectedHeader({ alg: "HS256" });
  return jwt.sign(encodeSecret(accessSecret));
}

/**
 * 验证 OAuth Access Token
 *
 * 仅接受 type="access_token"（由 signOAuthAccessToken 签发）。
 * 与 verifyUserToken 隔离：C 端内部 API 使用 verifyUserToken，
 * OAuth 端点使用此函数。
 *
 * @param token - JWT token 字符串
 * @param expectedClientId - 可选，预期 clientId。传入时严格校验 aud claim；
 *   不传时跳过 audience 校验（用于 userinfo/introspect 等通用端点）
 */
export async function verifyOAuthAccessToken(
  token: string,
  expectedClientId?: string
): Promise<OAuthAccessTokenPayload | null> {
  try {
    const verifyOptions: { issuer: string; audience?: string; algorithms?: string[] } = {
      issuer: ISSUER,
      algorithms: ["HS256", "RS256"],
    };
    // 仅当调用方明确传入 expectedClientId 时才校验 audience
    // userinfo/introspect 等通用端点不需要限制 audience
    if (expectedClientId) {
      verifyOptions.audience = expectedClientId;
    }

    // 优先尝试 RS256 公钥验证（若已配置）
    const publicKey = await getAccessPublicKey();
    let payload: import("jose").JWTPayload;

    if (publicKey) {
      try {
        const result = await jwtVerify(token, publicKey, verifyOptions);
        payload = result.payload;
      } catch {
        // RS256 验证失败，尝试 HS256（兼容旧 token）
        const result = await jwtVerify(token, encodeSecret(accessSecret), verifyOptions);
        payload = result.payload;
      }
    } else {
      const result = await jwtVerify(token, encodeSecret(accessSecret), verifyOptions);
      payload = result.payload;
    }

    const t = (payload as { type?: string }).type;
    if (t !== "access_token") {
      return null;
    }
    // RFC 7009 access_token 撤销检查
    const jti = (payload as { jti?: string }).jti;
    if (jti && isAccessTokenRevoked(jti)) {
      return null;
    }
    return payload as unknown as OAuthAccessTokenPayload;
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
 * 从已签发的 JWT 计算 `expires_in`（剩余秒数）
 * 不验证签名，仅解码 payload 中的 exp claim。
 */
export function getExpiresInFromToken(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    ) as { exp?: number };
    if (!payload.exp || typeof payload.exp !== "number") return null;
    const remaining = payload.exp - Math.floor(Date.now() / 1000);
    return Math.max(0, remaining);
  } catch {
    return null;
  }
}

/**
 * 获取 Refresh Token 过期时间戳（秒，30天）
 */
export function getRefreshTokenExpiresAt(): number {
  return Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
}
