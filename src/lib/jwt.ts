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
import { maskPhone } from "./mask-phone";
import { getIssuer } from "./oauth-constants";
import { prisma } from "./prisma";
import type {
  AdminJWTPayload,
  UserJWTPayload,
  RefreshTokenPayload,
  OAuthAccessTokenPayload,
  AdminRole,
} from "@/types/auth";

// issuer 统一由 oauth-constants.getIssuer() 生成（APP_URL → BASE_URL → VERCEL_URL → localhost）
const ISSUER = getIssuer();
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

/**
 * 启动时校验密钥类环境变量：强制存在性 + 最小长度。
 * 供 jwt.ts 自身的 JWT Secret 与其他安全密钥（如 auth-security.ts 的
 * LOGIN_ATTEMPT_HMAC_KEY）复用，保证校验行为一致。
 */
export function validateSecret(name: string, value: string | undefined): string {
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

/**
 * 验证失败的错误摘要输出（可观测性）：
 * 非生产环境 warn 一行错误摘要，便于排查密钥配置错误（如 PEM 格式损坏）；
 * jose 的错误信息本身不含 token 本体与密钥内容，可安全输出。
 * 生产环境保持静默（非法 token 属常态输入，避免刷日志）。
 * 注意：不使用 @/lib/logger，部分测试以不完整 factory mock 该模块，
 * 直接 console.warn 避免 mock 缺导出时验证路径抛错。
 */
function warnVerifyError(fnName: string, error: unknown): void {
  if (process.env.NODE_ENV === "production") return;
  const digest = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.warn(`[JWT] ${fnName} 验证失败: ${digest}`);
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
let cachedPrevAccessPublicKey: CryptoKey | null = null;

// kid 可通过环境变量覆盖（默认保持现值），配合上一代公钥实现最小密钥轮换
export function getAccessKeyId(): string {
  return process.env.JWT_OAUTH_ACCESS_KID || "access-token-rs256-v1";
}

export function getPrevAccessKeyId(): string {
  return process.env.JWT_OAUTH_ACCESS_PREV_KID || "access-token-rs256-v0";
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

/** 上一代 Access Token 公钥（密钥轮换过渡期，仅用于验证旧 token 与 JWKS 发布） */
export async function getPrevAccessPublicKey(): Promise<CryptoKey | null> {
  if (!process.env.JWT_OAUTH_ACCESS_PREV_PUBLIC_KEY) return null;
  if (cachedPrevAccessPublicKey) return cachedPrevAccessPublicKey;
  cachedPrevAccessPublicKey = await importSPKI(
    process.env.JWT_OAUTH_ACCESS_PREV_PUBLIC_KEY,
    "RS256"
  );
  return cachedPrevAccessPublicKey;
}

/** Access Token 验签候选公钥：当前 + 上一代（按顺序尝试，jose JWKS 消费方按 kid 自然匹配） */
async function getAccessVerifyPublicKeys(): Promise<CryptoKey[]> {
  const keys: CryptoKey[] = [];
  const current = await getAccessPublicKey();
  if (current) keys.push(current);
  const prev = await getPrevAccessPublicKey();
  if (prev) keys.push(prev);
  return keys;
}

// ============================================
// OAuth ID Token RS256 迁移支持（可选）
// ============================================

let cachedIdTokenPrivateKey: CryptoKey | null = null;
let cachedIdTokenPublicKey: CryptoKey | null = null;
let cachedPrevIdTokenPublicKey: CryptoKey | null = null;

export function getIdTokenKeyId(): string {
  return process.env.JWT_OAUTH_ID_TOKEN_KID || "id-token-rs256-v1";
}

export function getPrevIdTokenKeyId(): string {
  return process.env.JWT_OAUTH_ID_TOKEN_PREV_KID || "id-token-rs256-v0";
}

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

/** 上一代 ID Token 公钥（密钥轮换过渡期，仅用于验证旧 token 与 JWKS 发布） */
export async function getPrevIdTokenPublicKey(): Promise<CryptoKey | null> {
  if (!process.env.JWT_OAUTH_ID_TOKEN_PREV_PUBLIC_KEY) return null;
  if (cachedPrevIdTokenPublicKey) return cachedPrevIdTokenPublicKey;
  cachedPrevIdTokenPublicKey = await importSPKI(
    process.env.JWT_OAUTH_ID_TOKEN_PREV_PUBLIC_KEY,
    "RS256"
  );
  return cachedPrevIdTokenPublicKey;
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
    .sign(adminSecret);

  return token;
}

/**
 * 验证管理员 JWT Token
 */
export async function verifyToken(token: string): Promise<AdminJWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, adminSecret, {
      issuer: ISSUER,
      audience: "admin",
      algorithms: ["HS256"],
    });
    // 确保是管理员 token，防止用户 token 被用于访问 admin API
    if ((payload as AdminJWTPayload & { type?: string }).type !== "admin") {
      return null;
    }
    return payload as AdminJWTPayload;
  } catch (error) {
    warnVerifyError("verifyToken", error);
    return null;
  }
}

// ============================================
// C端用户 Token（双 Token 策略）
// ============================================

/**
 * 签发用户 Access Token（短期，15分钟）
 *
 * 用于 C 端用户内部 API（如 /api/user/profile、/api/user/points 等）。
 * Token type="user"，audience="user"，仅供 verifyUserToken 验证。
 *
 * 与 OAuth Access Token 的区别：
 * - OAuth：type="access_token"，audience=clientId，由 signOAuthAccessToken 签发
 * - 内部：type="user"，audience="user"，由本函数签发
 * - 两者使用不同的 token type，verifyOAuthAccessToken 仅接受 access_token 类型
 *
 * 注意：payload 不再携带明文 phone（与 OAuth 侧脱敏策略一致），
 * 避免明文手机号经日志/子项目泄漏；业务侧需要手机号时按 id 查库获取。
 */
export async function signUserToken(payload: {
  id: string;
  /** 原始认证时间（Unix 秒）。refresh 换发时透传，防止 max_age 被新 iat 架空 */
  authTime?: number;
}): Promise<string> {
  const jwtPayload: Record<string, unknown> = {
    id: payload.id,
    type: "user" as const,
  };
  if (payload.authTime) jwtPayload.auth_time = payload.authTime;

  const token = await new SignJWT(jwtPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience("user")
    .setJti(crypto.randomUUID())
    .setExpirationTime(accessTokenExpiresIn)
    .sign(accessSecret);

  return token;
}

/**
 * verifyUserToken 的进程内短 TTL 缓存（模式参照下方 m2mClientActiveCache）。
 *
 * 作为中心 IDP，verifyUserToken 每次验证需查 jti 撤销状态与 user.passwordChangedAt，
 * 高并发下是 DB 热点；5s 短缓存是性能与即时性的折衷（与 M2M 30s 缓存取舍一致）。
 *
 * 取舍说明：
 * - jti 撤销缓存（revokedJtiCache）：肯定/否定结果均缓存 5s，
 *   登出撤销最长延迟 5s 生效（同实例），可接受——access token 本身 TTL 仅 15 分钟。
 * - 改密时间缓存（passwordChangedAtCache）：同时缓存"用户不存在"的结果，
 *   改密后旧 token 最长延迟 5s 失效；DB 查询异常不缓存，保持原有 fail-closed 行为。
 * - 多实例部署时各实例独立缓存，失效延迟同为最长 5s。
 */
const VERIFY_CACHE_TTL_MS = 5 * 1000;

const revokedJtiCache = new LRUCache<string, boolean>({
  max: 10000,
  ttl: VERIFY_CACHE_TTL_MS,
});

// value 为 false 表示"用户不存在"；{ changedAt: null } 表示存在但未改过密码
// （LRUCache 值类型不允许 null/undefined，故用对象包裹；缓存未命中时 get 返回 undefined）
const passwordChangedAtCache = new LRUCache<string, { changedAt: Date | null } | false>({
  max: 10000,
  ttl: VERIFY_CACHE_TTL_MS,
});

/** 测试辅助：清空 verifyUserToken 的进程内缓存，避免用例间状态串扰 */
export function _clearVerifyCache(): void {
  revokedJtiCache.clear();
  passwordChangedAtCache.clear();
}

/** jti 撤销检查（5s 缓存）：DB 异常时不缓存，异常沿调用链上抛由 verifyUserToken 统一 fail-closed */
async function isAccessTokenRevokedCached(jti: string): Promise<boolean> {
  const cached = revokedJtiCache.get(jti);
  if (cached !== undefined) return cached;
  const revoked = await isAccessTokenRevoked(jti);
  revokedJtiCache.set(jti, revoked);
  return revoked;
}

/**
 * 查询用户最近一次改密时间（5s 缓存，key=userId）。
 * 返回值语义：undefined = 用户不存在；null = 存在但未改过密码；Date = 改密时间。
 * "用户不存在"同样缓存 5s，防止对已删除用户的 token 反复打库；
 * DB 异常不缓存（直接上抛），保持原有失败行为。
 */
async function getPasswordChangedAtCached(userId: string): Promise<Date | null | undefined> {
  const cached = passwordChangedAtCache.get(userId);
  if (cached !== undefined) {
    return cached === false ? undefined : cached.changedAt;
  }
  const userRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordChangedAt: true },
  });
  if (!userRecord) {
    passwordChangedAtCache.set(userId, false);
    return undefined;
  }
  const changedAt = userRecord.passwordChangedAt ?? null;
  passwordChangedAtCache.set(userId, { changedAt });
  return changedAt;
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
    const { payload } = await jwtVerify(token, accessSecret, {
      issuer: ISSUER,
      audience: "user",
      algorithms: ["HS256"],
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

    // 单条 token 级撤销检查（登出时 revokeAccessToken(jti) 写入）：
    // 消除登出后 access token 在剩余 TTL 内仍可使用的窗口。
    // 无 jti 的旧 token（本改动上线前签发）跳过，自然过期兼容。
    // 5s 进程内缓存：登出撤销最长延迟 5s 生效，换取高并发下的 DB 减压。
    const jti = (payload as UserJWTPayload).jti;
    if (jti && (await isAccessTokenRevokedCached(jti))) {
      return null;
    }

    // 黑名单检查（封禁用户时消除 15 分钟 access token 窗口）
    const userId = (payload as UserJWTPayload).id;
    const blacklisted = await isTokenBlacklisted(userId);
    if (blacklisted) {
      return null;
    }

    // 改密即时失效：token 签发时间早于最近一次密码变更 → 拒绝。
    // 替代 user 级黑名单方案：重置/修改密码后，旧 token 全部失效，
    // 而受害者重新登录签发的新 token（iat >= 改密时刻）不受影响，无自锁窗口。
    // 比对以秒为粒度（iat 为 Unix 秒），同一秒内签发的 token 放行（可忽略窗口）。
    // 5s 进程内缓存：改密后旧 token 最长延迟 5s 失效；DB 异常不缓存，保持 fail-closed。
    const passwordChangedAt = await getPasswordChangedAtCached(userId);
    if (passwordChangedAt === undefined) {
      // 用户不存在
      return null;
    }
    if (
      passwordChangedAt &&
      typeof payload.iat === "number" &&
      payload.iat < Math.floor(passwordChangedAt.getTime() / 1000)
    ) {
      return null;
    }

    return payload as UserJWTPayload;
  } catch (error) {
    warnVerifyError("verifyUserToken", error);
    return null;
  }
}

/**
 * 签发用户 Refresh Token（长期，30天）
 *
 * 安全约定：不再写入明文手机号 claim（与内部 access token 移除 phone 的方向一致），
 * 消费方需要手机号时按 id 查库。
 *
 * @param payload.clientId - OAuth client_id，可选。传入时写入 payload，用于 refresh 时校验所有权。
 * @param payload.scope - 授权 scope，可选。传入时写入 payload，便于后续审计与最小权限校验。
 * @param payload.sid - 关联的 OAuthSession.sessionId，可选。revoke 时据此定位单个会话撤销。
 * @param payload.dpopJkt - DPoP 绑定的 JWK Thumbprint，可选。refresh 时据此要求并验证 DPoP proof。
 * @param payload.authTime - 原始认证时间（Unix 秒），可选。refresh 换发时透传，跨轮换不丢失。
 */
export async function signRefreshToken(payload: {
  id: string;
  clientId?: string;
  scope?: string;
  sid?: string;
  dpopJkt?: string;
  authTime?: number;
}): Promise<string> {
  const jwtPayload: Record<string, unknown> = {
    id: payload.id,
    type: "refresh" as const,
  };
  // 仅在传入时写入，保持内部非 OAuth token 的向后兼容
  if (payload.clientId) jwtPayload.client_id = payload.clientId;
  if (payload.scope) jwtPayload.scope = payload.scope;
  if (payload.sid) jwtPayload.sid = payload.sid;
  if (payload.dpopJkt) jwtPayload.dpop_jkt = payload.dpopJkt;
  if (payload.authTime) jwtPayload.auth_time = payload.authTime;

  const token = await new SignJWT(jwtPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience("refresh")
    .setExpirationTime(refreshTokenExpiresIn)
    .sign(refreshSecret);

  return token;
}

/**
 * 验证用户 Refresh Token
 */
export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, refreshSecret, {
      issuer: ISSUER,
      audience: "refresh",
      algorithms: ["HS256"],
    });
    // 确保是 refresh token
    if ((payload as RefreshTokenPayload).type !== "refresh") {
      return null;
    }
    return payload as RefreshTokenPayload;
  } catch (error) {
    warnVerifyError("verifyRefreshToken", error);
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
  /** 外部身份归属平台（签发入口已知时携带，bind 端点据此写入 ExternalIdentity） */
  provider?: "wechat_open" | "wechat_mp" | "wechat_miniprogram" | "douyin";
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
    .sign(wechatBindSecret);

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

/**
 * M2M client 活跃状态的进程内短 TTL 缓存。
 * M2M token 无用户黑名单与 sid 会话兜底，client 停用/删除后已签发的 token
 * 只能靠验证时实时查 client 状态即时失效；30s 短缓存是性能与即时性的折衷
 * （进程内缓存惯例参照 oauth-client.ts 的 oldSecretCache）。
 * 停用/删除操作经 invalidateM2mClientCache 主动清除本实例缓存，做到同实例立即生效；
 * 多实例部署时其它实例最长 30s 后生效。
 */
const m2mClientActiveCache = new LRUCache<string, boolean>({
  max: 1000,
  ttl: 30 * 1000,
});

/** 使指定 client 的 M2M 活跃状态缓存失效（停用/删除 client 时调用） */
export function invalidateM2mClientCache(clientId: string): void {
  m2mClientActiveCache.delete(clientId);
}

async function isM2mClientActive(clientId: string): Promise<boolean> {
  const cached = m2mClientActiveCache.get(clientId);
  if (cached !== undefined) return cached;
  const client = await prisma.oAuthClient.findUnique({
    where: { clientId },
    select: { isActive: true },
  });
  const active = client?.isActive === true;
  m2mClientActiveCache.set(clientId, active);
  return active;
}

export async function isWechatExchangeTokenUsed(token: string): Promise<boolean> {
  const hash = hashWechatExchangeToken(token);
  return usedWechatExchangeTokens.has(hash);
}

/**
 * 原子化消费 WeChat Exchange Token：检查 + 标记合二为一，消除 TOCTOU 窗口。
 * 通过数据库 INSERT 唯一约束实现原子性：首次插入成功 → 未使用；P2002 冲突 → 已被使用。
 * DB 不可用时 fail-closed：拒绝所有无法在内存中确认已消费的 token，
 * 避免 DB 故障期间 token 被重放攻击绕过；内存 LRU 仅作为已消费 token 的快速路径。
 * @returns true 表示 token 未被使用（本次消费成功），false 表示已被使用或无法确认
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
    // DB 不可用：fail-closed，拒绝消费
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
    .sign(wechatExchangeSecret);

  return token;
}

/**
 * 验证微信授权 exchange token
 */
export async function verifyWechatExchangeToken(
  token: string
): Promise<WechatExchangePayload | null> {
  try {
    const { payload } = await jwtVerify(token, wechatExchangeSecret, {
      issuer: ISSUER,
      audience: "wechat-exchange",
      algorithms: ["HS256"],
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
  } catch (error) {
    warnVerifyError("verifyWechatExchangeToken", error);
    return null;
  }
}

/**
 * 验证微信绑定临时 Token
 */
export async function verifyWechatBindToken(token: string): Promise<WechatBindPayload | null> {
  try {
    const { payload } = await jwtVerify(token, wechatBindSecret, {
      issuer: ISSUER,
      audience: "wechat-bind",
      algorithms: ["HS256"],
    });
    if ((payload as { type?: string }).type !== "wechat_bind") {
      return null;
    }
    return payload as unknown as WechatBindPayload;
  } catch (error) {
    warnVerifyError("verifyWechatBindToken", error);
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
    jwt.setProtectedHeader({ alg: "RS256", typ: "JWT", kid: getIdTokenKeyId() });
    return jwt.sign(rs256PrivateKey);
  }

  jwt.setProtectedHeader({ alg: "HS256" });
  return jwt.sign(idTokenSecret);
}

/**
 * 验证 OIDC ID Token（验签 + iss/aud/type 校验）
 *
 * 用于 RP-Initiated Logout 的 id_token_hint 验证等主站侧场景。
 * 与 signIdToken 的密钥策略对称：优先 RS256 公钥（含上一代轮换公钥），
 * 未配置 RS256 或显式启用 ALLOW_HS256_FALLBACK 时回退 HS256。
 *
 * @param token - ID Token 字符串
 * @param expectedAudience - 可选，预期 aud（通常为发起方的 client_id）
 */
export async function verifyIdToken(
  token: string,
  expectedAudience?: string
): Promise<IdTokenClaims | null> {
  try {
    // 基础校验项；algorithms 在各分支显式指定（公钥分支 RS256，对称密钥分支 HS256）
    const verifyOptions: { issuer: string; audience?: string } = {
      issuer: ISSUER,
    };
    if (expectedAudience) {
      verifyOptions.audience = expectedAudience;
    }

    // 优先尝试 RS256 公钥验证（若已配置），密钥轮换期依次尝试当前与上一代公钥
    const publicKeys: CryptoKey[] = [];
    const currentKey = await getIdTokenPublicKey();
    if (currentKey) publicKeys.push(currentKey);
    const prevKey = await getPrevIdTokenPublicKey();
    if (prevKey) publicKeys.push(prevKey);

    let payload: import("jose").JWTPayload;
    if (publicKeys.length > 0) {
      let verified: import("jose").JWTPayload | null = null;
      for (const key of publicKeys) {
        try {
          const result = await jwtVerify(token, key, {
            ...verifyOptions,
            algorithms: ["RS256"],
          });
          verified = result.payload;
          break;
        } catch {
          // 尝试下一把公钥
        }
      }
      if (verified) {
        payload = verified;
      } else {
        // RS256 验证失败，仅在显式启用时回退 HS256（兼容旧 token）
        if (process.env.ALLOW_HS256_FALLBACK === "true") {
          const result = await jwtVerify(token, idTokenSecret, {
            ...verifyOptions,
            algorithms: ["HS256"],
          });
          payload = result.payload;
        } else {
          return null;
        }
      }
    } else {
      const result = await jwtVerify(token, idTokenSecret, {
        ...verifyOptions,
        algorithms: ["HS256"],
      });
      payload = result.payload;
    }

    if ((payload as { type?: string }).type !== "id_token") {
      return null;
    }

    return payload as unknown as IdTokenClaims;
  } catch (error) {
    warnVerifyError("verifyIdToken", error);
    return null;
  }
}

// ============================================
// OAuth Logout Token RS256 迁移支持（可选）
// ============================================

let cachedLogoutTokenPrivateKey: CryptoKey | null = null;
let cachedLogoutTokenPublicKey: CryptoKey | null = null;
let cachedPrevLogoutTokenPublicKey: CryptoKey | null = null;

export function getLogoutTokenKeyId(): string {
  return process.env.JWT_LOGOUT_TOKEN_KID || "logout-token-rs256-v1";
}

export function getPrevLogoutTokenKeyId(): string {
  return process.env.JWT_LOGOUT_TOKEN_PREV_KID || "logout-token-rs256-v0";
}

async function getLogoutTokenPrivateKey(): Promise<CryptoKey | null> {
  if (!process.env.JWT_LOGOUT_TOKEN_PRIVATE_KEY) return null;
  if (cachedLogoutTokenPrivateKey) return cachedLogoutTokenPrivateKey;
  try {
    cachedLogoutTokenPrivateKey = await importPKCS8(
      process.env.JWT_LOGOUT_TOKEN_PRIVATE_KEY,
      "RS256"
    );
  } catch {
    throw new Error(`[JWT] JWT_LOGOUT_TOKEN_PRIVATE_KEY 不是有效的 PKCS#8 PEM，请确认格式正确`);
  }
  return cachedLogoutTokenPrivateKey;
}

export async function getLogoutTokenPublicKey(): Promise<CryptoKey | null> {
  if (!process.env.JWT_LOGOUT_TOKEN_PUBLIC_KEY) return null;
  if (cachedLogoutTokenPublicKey) return cachedLogoutTokenPublicKey;
  try {
    cachedLogoutTokenPublicKey = await importSPKI(process.env.JWT_LOGOUT_TOKEN_PUBLIC_KEY, "RS256");
  } catch {
    throw new Error(`[JWT] JWT_LOGOUT_TOKEN_PUBLIC_KEY 不是有效的 SPKI PEM，请确认格式正确`);
  }
  return cachedLogoutTokenPublicKey;
}

/** 上一代 Logout Token 公钥（密钥轮换过渡期，仅用于验证旧 token 与 JWKS 发布） */
export async function getPrevLogoutTokenPublicKey(): Promise<CryptoKey | null> {
  if (!process.env.JWT_LOGOUT_TOKEN_PREV_PUBLIC_KEY) return null;
  if (cachedPrevLogoutTokenPublicKey) return cachedPrevLogoutTokenPublicKey;
  try {
    cachedPrevLogoutTokenPublicKey = await importSPKI(
      process.env.JWT_LOGOUT_TOKEN_PREV_PUBLIC_KEY,
      "RS256"
    );
  } catch {
    throw new Error(`[JWT] JWT_LOGOUT_TOKEN_PREV_PUBLIC_KEY 不是有效的 SPKI PEM，请确认格式正确`);
  }
  return cachedPrevLogoutTokenPublicKey;
}

/** Logout Token 验签候选公钥：当前 + 上一代（按顺序尝试） */
async function getLogoutTokenVerifyPublicKeys(): Promise<CryptoKey[]> {
  const keys: CryptoKey[] = [];
  const current = await getLogoutTokenPublicKey();
  if (current) keys.push(current);
  const prev = await getPrevLogoutTokenPublicKey();
  if (prev) keys.push(prev);
  return keys;
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
    jwt.setProtectedHeader({ alg: "RS256", typ: "JWT", kid: getLogoutTokenKeyId() });
    return jwt.sign(rs256PrivateKey);
  }

  jwt.setProtectedHeader({ alg: "HS256" });
  return jwt.sign(logoutSecret);
}

/**
 * 验证 Logout Token（仅验证，不消费 jti）
 *
 * jti 一次性消费/防重放不属于本函数职责：同一 logout_token 可能被 RP 重试验证
 * 或在多节点间转发，验证成功即标记已处理会造成误报。真正的防重放由 RP 侧
 * 处理登出时自行实现（sso-verify 已内置 jti LRU 去重）。
 */
export async function verifyLogoutToken(
  token: string,
  audience: string
): Promise<LogoutTokenClaims | null> {
  try {
    // 基础校验项；algorithms 在各分支显式指定（公钥分支 RS256，对称密钥分支 HS256）
    const verifyOptions: { issuer: string; audience: string } = {
      issuer: ISSUER,
      audience,
    };

    const publicKeys = await getLogoutTokenVerifyPublicKeys();
    let payload: import("jose").JWTPayload;

    if (publicKeys.length > 0) {
      let verified: import("jose").JWTPayload | null = null;
      // 密钥轮换：依次尝试当前公钥与上一代公钥
      for (const key of publicKeys) {
        try {
          const result = await jwtVerify(token, key, {
            ...verifyOptions,
            algorithms: ["RS256"],
          });
          verified = result.payload;
          break;
        } catch {
          // 尝试下一把公钥
        }
      }
      if (verified) {
        payload = verified;
      } else {
        if (process.env.ALLOW_HS256_FALLBACK === "true") {
          const result = await jwtVerify(token, logoutSecret, {
            ...verifyOptions,
            algorithms: ["HS256"],
          });
          payload = result.payload;
        } else {
          return null;
        }
      }
    } else {
      const result = await jwtVerify(token, logoutSecret, {
        ...verifyOptions,
        algorithms: ["HS256"],
      });
      payload = result.payload;
    }

    if ((payload as { type?: string }).type !== "logout_token") {
      return null;
    }

    // OIDC Back-Channel Logout 规范：logout_token 禁止携带 nonce claim
    // （nonce 用于将 ID Token 绑定到客户端会话，logout token 不适用）
    if ((payload as { nonce?: unknown }).nonce !== undefined) {
      return null;
    }

    const claims = payload as unknown as LogoutTokenClaims;
    if (!claims.jti || typeof claims.jti !== "string") {
      return null;
    }

    return claims;
  } catch (error) {
    warnVerifyError("verifyLogoutToken", error);
    return null;
  }
}

// ============================================
// Profile Event Token（用户资料变更 Webhook）
// ============================================

export interface ProfileEventTokenClaims {
  sub: string;
  aud: string;
  events: Record<string, unknown>;
  jti: string;
  /** 变更后的公开资料快照（与 userinfo profile scope 输出一致，不含手机号） */
  profile: {
    nickname: string | null;
    avatar: string | null;
    birthday: string | null;
  };
}

/**
 * 签发 Profile Event Token（5分钟，用于用户资料变更 webhook 推送）
 *
 * 与 signLogoutToken 相同的 RS256 密钥对（JWT_LOGOUT_TOKEN_*）与签名模式，
 * 子项目可复用 logout_token 的验签配置（JWKS / 公钥）验证本事件 token。
 * type 为 "profile_event"，与 logout_token 区分，防止事件类型混用。
 */
export async function signProfileEventToken(claims: ProfileEventTokenClaims): Promise<string> {
  const jwt = new SignJWT({ ...claims, type: "profile_event" as const })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(claims.aud)
    .setSubject(claims.sub)
    .setJti(claims.jti || crypto.randomUUID())
    .setExpirationTime(logoutTokenExpiresIn);

  const rs256PrivateKey = await getLogoutTokenPrivateKey();
  if (rs256PrivateKey) {
    jwt.setProtectedHeader({ alg: "RS256", typ: "JWT", kid: getLogoutTokenKeyId() });
    return jwt.sign(rs256PrivateKey);
  }

  jwt.setProtectedHeader({ alg: "HS256" });
  return jwt.sign(logoutSecret);
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
  /** 关联的 OAuthSession.sessionId，验证时按 sid 查会话状态，撤销后即时失效 */
  sid?: string;
}): Promise<string> {
  const scopes = payload.scope.split(" ").filter(Boolean);
  const isM2m = payload.id.startsWith("client:");
  const claims: Record<string, unknown> = {
    id: payload.id,
    client_id: payload.clientId,
    scope: payload.scope,
    type: "access_token" as const,
    // M2M（client_credentials）身份的显式标记；消费方优先据此识别，兼容旧的 client: 前缀判断
    client_type: isM2m ? "m2m" : "user",
  };

  if (scopes.includes("phone")) {
    // 与 userinfo / ID Token 策略一致：access token 中的手机号同样脱敏，避免明文泄漏
    claims.phone = maskPhone(payload.phone);
  }

  if (payload.dpopJkt) {
    claims.cnf = { jkt: payload.dpopJkt };
  }

  if (payload.sid) {
    claims.sid = payload.sid;
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
    jwt.setProtectedHeader({ alg: "RS256", typ: "JWT", kid: getAccessKeyId() });
    return jwt.sign(rs256PrivateKey);
  }

  jwt.setProtectedHeader({ alg: "HS256" });
  return jwt.sign(accessSecret);
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
    // 基础校验项；algorithms 在各分支显式指定（公钥分支 RS256，对称密钥分支 HS256）
    const verifyOptions: { issuer: string; audience?: string } = {
      issuer: ISSUER,
    };
    // 仅当调用方明确传入 expectedClientId 时才校验 audience
    // userinfo/introspect 等通用端点不需要限制 audience
    if (expectedClientId) {
      verifyOptions.audience = expectedClientId;
    }

    // 优先尝试 RS256 公钥验证（若已配置），密钥轮换期依次尝试当前与上一代公钥
    const publicKeys = await getAccessVerifyPublicKeys();
    let payload: import("jose").JWTPayload;

    if (publicKeys.length > 0) {
      let verified: import("jose").JWTPayload | null = null;
      for (const key of publicKeys) {
        try {
          const result = await jwtVerify(token, key, {
            ...verifyOptions,
            algorithms: ["RS256"],
          });
          verified = result.payload;
          break;
        } catch {
          // 尝试下一把公钥
        }
      }
      if (verified) {
        payload = verified;
      } else {
        // RS256 验证失败，仅在显式启用时回退 HS256（兼容旧 token）
        if (process.env.ALLOW_HS256_FALLBACK === "true") {
          const result = await jwtVerify(token, accessSecret, {
            ...verifyOptions,
            algorithms: ["HS256"],
          });
          payload = result.payload;
        } else {
          return null;
        }
      }
    } else {
      const result = await jwtVerify(token, accessSecret, {
        ...verifyOptions,
        algorithms: ["HS256"],
      });
      payload = result.payload;
    }

    const t = (payload as { type?: string }).type;
    if (t !== "access_token") {
      return null;
    }
    // 用户级黑名单检查（封禁后 15 分钟窗口期内拒绝）
    // M2M token（显式 client_type="m2m" 或旧格式 sub = "client:xxx"）无关联用户，
    // 不查用户黑名单，改为校验签发 client 仍存在且 isActive：
    // client 停用/删除后已签发的 M2M token 立即失效（M2M 无 sid 会话校验兜底）。
    const userId = (payload as { id?: string }).id;
    const clientType = (payload as { client_type?: string }).client_type;
    const isM2m = clientType === "m2m" || (userId?.startsWith("client:") ?? false);
    if (isM2m) {
      const m2mClientId = (payload as { client_id?: string }).client_id;
      if (!m2mClientId || !(await isM2mClientActive(m2mClientId))) {
        return null;
      }
    } else if (userId && (await isTokenBlacklisted(userId))) {
      return null;
    }

    // RFC 7009 access_token 撤销检查
    const jti = (payload as { jti?: string }).jti;
    if (jti && (await isAccessTokenRevoked(jti))) {
      return null;
    }

    // sid 会话校验（fail-closed）：携带 sid 的 token 必须对应一条未撤销、未过期的
    // OAuthSession。撤销授权/终止会话仅标记 OAuthSession.revokedAt，access token 依此
    // 即时失效，无需拉黑用户全部 token（避免误登出主站会话）。
    // 无 sid 的 token（上线前签发的旧 token、M2M token）跳过此校验，保持向后兼容。
    const sid = (payload as { sid?: string }).sid;
    if (sid) {
      const session = await prisma.oAuthSession.findUnique({
        where: { sessionId: sid },
        select: { revokedAt: true, expiresAt: true },
      });
      if (!session || session.revokedAt || session.expiresAt <= new Date()) {
        return null;
      }
    }

    return payload as unknown as OAuthAccessTokenPayload;
  } catch (error) {
    warnVerifyError("verifyOAuthAccessToken", error);
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
