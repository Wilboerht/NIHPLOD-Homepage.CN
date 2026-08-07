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
import { isAccessTokenRevoked, isTokenBlacklisted } from "./token-blacklist";
import { prisma } from "./prisma";
import type { AdminJWTPayload, UserJWTPayload, RefreshTokenPayload, OAuthAccessTokenPayload, AdminRole } from "@/types/auth";

const ISSUER = process.env.NEXT_PUBLIC_APP_URL || "https://nihplod.cn";
const MIN_SECRET_LENGTH = 32;

// 生产环境保护：NEXT_PUBLIC_APP_URL 必须是公网地址，否则子项目发现端点失效
// 跳过构建阶段（NEXT_PHASE 存在时）的校验，构建产物中该值由部署环境注入
if (
  process.env.NODE_ENV === "production" &&
  !process.env.NEXT_PHASE &&
  (!process.env.NEXT_PUBLIC_APP_URL || new URL(ISSUER).hostname === "localhost")
) {
  throw new Error(
    "[JWT] 生产环境必须设置 NEXT_PUBLIC_APP_URL 为公网地址（如 https://nihplod.cn），" +
    "OIDC Discovery 端点依赖此值生成 issuer 和端点 URL。"
  );
}

// 已处理的 logout_token jti 缓存（主站自身验证入口）
// TTL 10 分钟：logout token 本身有效期 5 分钟，留足时钟偏移余量。
const processedLogoutJtis = new LRUCache<string, number>({
  max: 10000,
  ttl: 10 * 60 * 1000,
});

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

// RS256 ID Token 密钥对：SSO SDK v2+ 拒绝 HS256 ID Token，生产环境必须配置
// 跳过构建阶段（NEXT_PHASE 存在时）的校验
if (
  process.env.NODE_ENV === "production" &&
  !process.env.NEXT_PHASE &&
  (!process.env.JWT_ID_TOKEN_PRIVATE_KEY || !process.env.JWT_ID_TOKEN_PUBLIC_KEY)
) {
  throw new Error(
    "[JWT] 生产环境必须配置 JWT_ID_TOKEN_PRIVATE_KEY 和 JWT_ID_TOKEN_PUBLIC_KEY。" +
    "SSO SDK 已拒绝 HS256 签名的 ID Token，缺少 RS256 密钥对将导致所有 SDK 客户端登录失败。"
  );
}

// ============================================
// OAuth Access Token RS256 迁移支持（可选）
// ============================================

let cachedAccessPrivateKey: CryptoKey | null = null;
let cachedAccessPublicKey: CryptoKey | null = null;

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

// ============================================
// OAuth ID Token RS256 迁移支持（可选）
// ============================================

let cachedIdTokenPrivateKey: CryptoKey | null = null;
let cachedIdTokenPublicKey: CryptoKey | null = null;

async function getIdTokenPrivateKey(): Promise<CryptoKey | null> {
  if (!process.env.JWT_ID_TOKEN_PRIVATE_KEY) return null;
  if (cachedIdTokenPrivateKey) return cachedIdTokenPrivateKey;
  cachedIdTokenPrivateKey = await importPKCS8(process.env.JWT_ID_TOKEN_PRIVATE_KEY, "RS256");
  return cachedIdTokenPrivateKey;
}

export async function getIdTokenPublicKey(): Promise<CryptoKey | null> {
  if (!process.env.JWT_ID_TOKEN_PUBLIC_KEY) return null;
  if (cachedIdTokenPublicKey) return cachedIdTokenPublicKey;
  cachedIdTokenPublicKey = await importSPKI(process.env.JWT_ID_TOKEN_PUBLIC_KEY, "RS256");
  return cachedIdTokenPublicKey;
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
    .sign((adminSecret));

  return token;
}

/**
 * 验证管理员 JWT Token
 */
export async function verifyToken(token: string): Promise<AdminJWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, (adminSecret), {
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
    .sign((accessSecret));

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
    const { payload } = await jwtVerify(token, (accessSecret), {
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

    // 黑名单检查（封禁用户时消除 15 分钟 access token 窗口）
    const userId = (payload as UserJWTPayload).id;
    const blacklisted = await isTokenBlacklisted(userId);
    if (blacklisted) {
      return null;
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
    .sign((refreshSecret));

  return token;
}

/**
 * 验证用户 Refresh Token
 */
export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, (refreshSecret), {
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
    .sign((wechatBindSecret));

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

const WECHAT_EXCHANGE_TOKEN_TTL_MS = 15 * 60 * 1000;

export async function isWechatExchangeTokenUsed(token: string): Promise<boolean> {
  const hash = hashWechatExchangeToken(token);
  return usedWechatExchangeTokens.has(hash);
}

/**
 * 原子化消费 WeChat Exchange Token：检查 + 标记合二为一，消除 TOCTOU 窗口。
 * 通过数据库 INSERT 唯一约束实现原子性：首次插入成功 → 未使用；P2002 冲突 → 已被使用。
 * DB 不可用时回退到内存 LRU。
 * @returns true 表示 token 未被使用（本次消费成功），false 表示已被使用
 */
export async function consumeWechatExchangeToken(token: string): Promise<boolean> {
  const hash = hashWechatExchangeToken(token);
  if (usedWechatExchangeTokens.has(hash)) return false;

  try {
    await prisma.tokenBlacklist.create({
      data: {
        type: "wechat_exchange_token",
        key: `we:${hash}`,
        expiresAt: new Date(Date.now() + WECHAT_EXCHANGE_TOKEN_TTL_MS),
      },
    });
    usedWechatExchangeTokens.set(hash, Date.now());
    return true;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      // 唯一约束冲突：token 已被消费
      usedWechatExchangeTokens.set(hash, Date.now());
      return false;
    }
    // DB 不可用：fail-closed，拒绝所有未在内存中确认的 token
    // 避免 DB 故障期间 token 被重放攻击绕过
    if (usedWechatExchangeTokens.has(hash)) return false;
    return false;
  }
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
    .sign((wechatExchangeSecret));

  return token;
}

/**
 * 验证微信授权 exchange token
 */
export async function verifyWechatExchangeToken(
  token: string
): Promise<WechatExchangePayload | null> {
  try {
    const { payload } = await jwtVerify(token, (wechatExchangeSecret), {
      issuer: ISSUER,
      audience: "wechat-exchange",
    });
    if ((payload as { type?: string }).type !== "wechat_exchange") {
      return null;
    }
    // 原子化消费：检查 + 标记合二为一，消除 TOCTOU 竞态窗口
    const consumed = await consumeWechatExchangeToken(token);
    if (!consumed) {
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
    const { payload } = await jwtVerify(token, (wechatBindSecret), {
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
  membership_level?: string;
  total_points?: number;
  scope?: string;
  /** OIDC Core 3.1.3.6: nonce 参数回显，绑定 ID Token 到客户端原始 session */
  nonce?: string;
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
 *
 * 若配置了 JWT_ID_TOKEN_PRIVATE_KEY / JWT_ID_TOKEN_PUBLIC_KEY，
 * 优先使用 RS256，便于 Public Client 通过 JWKS 本地验证签名。
 * 否则回退 HS256（由服务端 JWT_ID_TOKEN_SECRET 签名）。
 */
export async function signIdToken(claims: IdTokenClaims): Promise<string> {
  const jwt = new SignJWT({ ...claims, type: "id_token" as const })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(claims.aud)
    .setSubject(claims.sub)
    .setJti(crypto.randomUUID())
    .setExpirationTime(idTokenExpiresIn);

  const rs256PrivateKey = await getIdTokenPrivateKey();
  if (rs256PrivateKey) {
    jwt.setProtectedHeader({ alg: "RS256", typ: "JWT", kid: "id-token-rs256-v1" });
    return jwt.sign(rs256PrivateKey);
  }

  jwt.setProtectedHeader({ alg: "HS256" });
  return jwt.sign((idTokenSecret));
}

/**
 * 验证 ID Token
 *
 * 支持 RS256（优先，若配置了公钥）与 HS256（兼容旧 token）。
 */
export async function verifyIdToken(token: string, audience: string): Promise<IdTokenClaims | null> {
  try {
    const verifyOptions: { issuer: string; audience: string; algorithms?: string[] } = {
      issuer: ISSUER,
      audience,
      algorithms: ["HS256", "RS256"],
    };

    const publicKey = await getIdTokenPublicKey();
    let payload: import("jose").JWTPayload;

    if (publicKey) {
      try {
        const result = await jwtVerify(token, publicKey, { ...verifyOptions, algorithms: ["RS256"] });
        payload = result.payload;
      } catch {
        // RS256 验证失败，仅在显式启用时回退 HS256（兼容旧 token）
        if (process.env.ALLOW_HS256_FALLBACK === "true") {
          const result = await jwtVerify(token, (idTokenSecret), { ...verifyOptions, algorithms: ["HS256"] });
          payload = result.payload;
        } else {
          return null;
        }
      }
    } else {
      const result = await jwtVerify(token, (idTokenSecret), verifyOptions);
      payload = result.payload;
    }

    if ((payload as { type?: string }).type !== "id_token") {
      return null;
    }
    return payload as unknown as IdTokenClaims;
  } catch {
    return null;
  }
}

// ============================================
// OAuth Logout Token RS256 迁移支持（可选）
// ============================================

let cachedLogoutTokenPrivateKey: CryptoKey | null = null;
let cachedLogoutTokenPublicKey: CryptoKey | null = null;

async function getLogoutTokenPrivateKey(): Promise<CryptoKey | null> {
  if (!process.env.JWT_LOGOUT_TOKEN_PRIVATE_KEY) return null;
  if (cachedLogoutTokenPrivateKey) return cachedLogoutTokenPrivateKey;
  try {
    cachedLogoutTokenPrivateKey = await importPKCS8(process.env.JWT_LOGOUT_TOKEN_PRIVATE_KEY, "RS256");
  } catch {
    throw new Error(
      `[JWT] JWT_LOGOUT_TOKEN_PRIVATE_KEY 不是有效的 PKCS#8 PEM，请确认格式正确`
    );
  }
  return cachedLogoutTokenPrivateKey;
}

export async function getLogoutTokenPublicKey(): Promise<CryptoKey | null> {
  if (!process.env.JWT_LOGOUT_TOKEN_PUBLIC_KEY) return null;
  if (cachedLogoutTokenPublicKey) return cachedLogoutTokenPublicKey;
  try {
    cachedLogoutTokenPublicKey = await importSPKI(process.env.JWT_LOGOUT_TOKEN_PUBLIC_KEY, "RS256");
  } catch {
    throw new Error(
      `[JWT] JWT_LOGOUT_TOKEN_PUBLIC_KEY 不是有效的 SPKI PEM，请确认格式正确`
    );
  }
  return cachedLogoutTokenPublicKey;
}

// ============================================
// OAuth Logout Token (Backchannel Logout)
// ============================================

export interface LogoutTokenClaims {
  sub: string;
  aud: string;
  events: Record<string, unknown>;
  jti: string;
  sid?: string;
}

/**
 * 签发 Logout Token（5分钟，用于 backchannel logout）
 */
export async function signLogoutToken(claims: LogoutTokenClaims): Promise<string> {
  const jwtPayload: Record<string, unknown> = {
    ...claims,
    type: "logout_token" as const,
  };
  if (claims.sid) jwtPayload.sid = claims.sid;

  const jwt = new SignJWT(jwtPayload)
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(claims.aud)
    .setSubject(claims.sub)
    .setJti(claims.jti || crypto.randomUUID())
    .setExpirationTime(logoutTokenExpiresIn);

  const rs256PrivateKey = await getLogoutTokenPrivateKey();
  if (rs256PrivateKey) {
    jwt.setProtectedHeader({ alg: "RS256", typ: "JWT", kid: "logout-token-rs256-v1" });
    return jwt.sign(rs256PrivateKey);
  }

  jwt.setProtectedHeader({ alg: "HS256" });
  return jwt.sign((logoutSecret));
}

/**
 * 验证 Logout Token
 */
export async function verifyLogoutToken(token: string, audience: string): Promise<LogoutTokenClaims | null> {
  try {
    const verifyOptions: { issuer: string; audience: string; algorithms?: string[] } = {
      issuer: ISSUER,
      audience,
      algorithms: ["HS256", "RS256"],
    };

    const publicKey = await getLogoutTokenPublicKey();
    let payload: import("jose").JWTPayload;

    if (publicKey) {
      try {
        const result = await jwtVerify(token, publicKey, { ...verifyOptions, algorithms: ["RS256"] });
        payload = result.payload;
      } catch {
        if (process.env.ALLOW_HS256_FALLBACK === "true") {
          const result = await jwtVerify(token, (logoutSecret), { ...verifyOptions, algorithms: ["HS256"] });
          payload = result.payload;
        } else {
          return null;
        }
      }
    } else {
      const result = await jwtVerify(token, (logoutSecret), verifyOptions);
      payload = result.payload;
    }

    if ((payload as { type?: string }).type !== "logout_token") {
      return null;
    }

    const claims = payload as unknown as LogoutTokenClaims;
    if (!claims.jti || typeof claims.jti !== "string") {
      return null;
    }
    // jti 重放检查：同一 logout_token 仅处理一次
    // 内存 LRU 作为快速路径；数据库模式额外提供多实例共享保护
    if (processedLogoutJtis.has(claims.jti)) {
      return null;
    }

    // 数据库模式：atomic upsert 防止多实例下的 jti 重用
    if (process.env.TOKEN_BLACKLIST_STORAGE === "database") {
      try {
        const dbKey = `logout_jti:${claims.jti}`;
        await prisma.tokenBlacklist.create({
          data: {
            type: "logout_jti",
            key: dbKey,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          },
        });
      } catch (err) {
        if (
          err &&
          typeof err === "object" &&
          "code" in err &&
          (err as { code: string }).code === "P2002"
        ) {
          return null;
        }
        // 数据库故障不影响单实例保护
      }
    }

    processedLogoutJtis.set(claims.jti, Date.now());

    return claims;
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
  expiresIn?: string;
  dpopJkt?: string;
}): Promise<string> {
  const scopes = payload.scope.split(" ").filter(Boolean);
  const claims: Record<string, unknown> = {
    id: payload.id,
    client_id: payload.clientId,
    scope: payload.scope,
    type: "access_token" as const,
  };

  if (scopes.includes("phone")) {
    claims.phone = payload.phone;
  }

  if (payload.dpopJkt) {
    claims.cnf = { jkt: payload.dpopJkt };
  }

  const jwt = new SignJWT(claims)
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(payload.clientId)
    .setJti(crypto.randomUUID())
    .setExpirationTime(payload.expiresIn || accessTokenExpiresIn);

  // 若配置了 RS256 密钥对，优先使用非对称签名；否则回退 HS256
  const rs256PrivateKey = await getAccessPrivateKey();
  if (rs256PrivateKey) {
    jwt.setProtectedHeader({ alg: "RS256", typ: "JWT", kid: "access-token-rs256-v1" });
    return jwt.sign(rs256PrivateKey);
  }

  jwt.setProtectedHeader({ alg: "HS256" });
  return jwt.sign((accessSecret));
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
        // RS256 验证失败，仅在显式启用时回退 HS256（兼容旧 token）
        if (process.env.ALLOW_HS256_FALLBACK === "true") {
          const result = await jwtVerify(token, (accessSecret), verifyOptions);
          payload = result.payload;
        } else {
          return null;
        }
      }
    } else {
      const result = await jwtVerify(token, (accessSecret), verifyOptions);
      payload = result.payload;
    }

    const t = (payload as { type?: string }).type;
    if (t !== "access_token") {
      return null;
    }
    // 用户级黑名单检查（封禁后 15 分钟窗口期内拒绝）
    // M2M token（sub = "client:xxx"）无需检查，无关联用户
    const userId = (payload as { id?: string }).id;
    if (userId && !userId.startsWith("client:") && (await isTokenBlacklisted(userId))) {
      return null;
    }

    // RFC 7009 access_token 撤销检查
    const jti = (payload as { jti?: string }).jti;
    if (jti && (await isAccessTokenRevoked(jti))) {
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
