/**
 * @nihplod/sso-verify
 *
 * NIHPLOD 一网通 SSO Token 验证工具包
 *
 * 供子项目在后端验证主站签发的 Access Token。
 *
 * 由于主站 access_token 的签名算法取决于部署配置（配置 JWT_ACCESS_PRIVATE_KEY
 * 后以 RS256 签名，未配置时回退 HS256 对称签名），JWKS 端点仅在 RS256
 * 模式下公开公钥，因此本工具包默认采用 OAuth 2.0 Token Introspection
 * （RFC 7662）端点进行验证。对于已知共享密钥/公钥的内部服务，也可传入
 * accessTokenSecret（HS256）或 accessTokenPublicKey / jwksUri（RS256）做本地 JWT 验证。
 *
 * 安装：npm install @nihplod/sso-verify
 *
 * 使用：
 * ```typescript
 * import { createTokenVerifier } from "@nihplod/sso-verify";
 * const verifier = createTokenVerifier({
 *   introspectionEndpoint: "https://nihplod.cn/api/oauth/introspect",
 *   clientId: "advisor",
 *   clientSecret: "YOUR_CLIENT_SECRET",
 *   audience: "advisor",
 * });
 *
 * const payload = await verifier.verify(token);
 * if (payload) {
 *   console.log(payload.sub); // 用户 ID
 * }
 * ```
 */

import {
  jwtVerify,
  importSPKI,
  createRemoteJWKSet,
  decodeProtectedHeader,
  type KeyLike,
  type JWTPayload,
} from "jose";
import { LRUCache } from "lru-cache";

// ============================================
// 类型定义
// ============================================

export interface SsoVerifierOptions {
  /** 期望的 audience（对应子项目的 client_id） */
  audience: string;

  /** 期望的 issuer（主站 URL），默认 "https://nihplod.cn" */
  issuer?: string;

  /**
   * Token Introspection 端点 URL。
   * 推荐优先使用，与主站签名算法（HS256/RS256）无关，且能实时感知撤销。
   */
  introspectionEndpoint?: string;

  /** 子项目的 client_id（用于 introspection） */
  clientId?: string;

  /** 子项目的 client_secret（用于 introspection） */
  clientSecret?: string;

  /**
   * 共享的 Access Token Secret（可选）。
   * 仅在子项目与主站共享 JWT_ACCESS_SECRET 时使用本地验证。
   * 注意：当前 JWKS 端点不公开对称密钥，因此不能通过 JWKS 获取此值。
   */
  accessTokenSecret?: string;

  /** Introspection 结果缓存 TTL（毫秒），默认 30 秒 */
  introspectCacheTtl?: number;

  /**
   * Introspection 请求超时时间（毫秒），默认 10 秒。
   * 超时按验证失败处理（返回 null）。
   */
  introspectTimeoutMs?: number;

  /**
   * Introspection 返回 active:false（已撤销/无效）结果的缓存 TTL（毫秒），默认 5 秒。
   * 明显短于 active:true 的 TTL，以降低 token 撤销后的生效延迟。
   * 设为 0 表示不缓存 active:false 结果。
   */
  introspectNegativeCacheTtl?: number;

  /**
   * Access Token RS256 公钥（PEM 格式，可选）。
   * 主站在配置 JWT_ACCESS_PRIVATE_KEY 后以 RS256 签名 access_token，
   * 子项目可传入此公钥进行本地验证，避免每次都调用 Introspection 端点。
   * 若主站未配置 RS256 密钥（回退 HS256 签名），此选项不生效。
   * 同时配置 jwksUri 时优先尝试此直接公钥，验证失败后自动回退 JWKS
   * （覆盖主站密钥轮换后旧公钥尚未更新的过渡期）。
   */
  accessTokenPublicKey?: string;

  /**
   * JWKS 端点 URL（可选）。
   * 子项目可传入此 URL 以动态获取 RS256 公钥进行本地验证。
   * 当 accessTokenPublicKey 未配置时，将通过此端点获取匹配 kid 的公钥；
   * 两者同时配置时先尝试直接公钥，失败后回退本端点（密钥轮换兜底）。
   */
  jwksUri?: string;

  /**
   * Logout Token Secret（可选）。
   * 用于本地验证主站签发的 logout_token（HS256 签名）。
   * 若未提供且未显式开启 allowLegacyAccessTokenSecretFallback，HS256 logout_token
   * 验证将失败（返回 null）。
   */
  logoutTokenSecret?: string;

  /**
   * 允许 HS256 logout_token 回退使用 accessTokenSecret 验证（默认 false，废弃路径）。
   *
   * 历史行为：未配置 logoutTokenSecret 时回退使用 accessTokenSecret 验证。
   * 风险：合法共享 access secret 的内部服务即可伪造任意用户的 logout_token（强制全站登出），
   * access secret 泄漏会同时击穿 access token 与 logout token 两条信任边界。
   * 仅当无法立即迁移旧部署时显式设为 true，并尽快改用 logoutTokenSecret 或 RS256 公钥。
   *
   * 开启后会在两处输出告警（console.warn）：
   * 1. 构造 verifier 时——若该回退路径实际可生效（配置了 accessTokenSecret 但未配置
   *    logoutTokenSecret）立即提示一次；
   * 2. 首次实际使用回退路径验证 HS256 logout_token 时——提示该路径正在被真实流量触发
   *    （一次性告警）。
   */
  allowLegacyAccessTokenSecretFallback?: boolean;

  /**
   * Logout Token RS256 公钥（PEM 格式，可选）。
   * 主站 logout_token 使用独立密钥对（kid: logout-token-rs256-v1）签名，
   * 与 access token 密钥不同，因此不能使用 accessTokenPublicKey 验证。
   * 若未提供但配置了 jwksUri，将通过 JWKS 按 kid 匹配获取对应公钥；
   * 两者同时配置时先尝试此直接公钥，验证失败后回退 JWKS（密钥轮换兜底）。
   * RS256 签名的 logout_token 在无任何可用公钥时验证失败（返回 null），
   * 不会静默回退到 HS256。
   */
  logoutTokenPublicKey?: string;

  /**
   * Introspection 请求失败重试次数，默认 1。
   * 仅对网络错误、5xx 与 429（限流）响应重试（短退避），其余 4xx 不重试。
   * 设为 0 表示不重试。
   */
  introspectRetries?: number;

  /**
   * JWT 时钟偏移容忍（秒），默认 60。
   * 应用于所有本地验签路径（HS256/RS256/logout token），
   * 用于容忍子项目与主站之间的时钟偏差。
   */
  clockToleranceSeconds?: number;

  /**
   * Logout Token jti 外部存储（可选）。
   * 默认使用进程内 LRU 缓存（重启即清空、多实例不共享）；
   * 多实例部署时应注入共享存储（如 Redis 实现）以防跨实例重放。
   */
  logoutJtiStore?: LogoutJtiStore;

  /**
   * Introspection audience 严格模式（默认 true，fail-closed）。
   *
   * 严格模式下，introspection 响应既无 aud 又无 client_id 时拒绝
   * （防止 confused deputy：把发给其他 client 的 token 当成自己的）。
   * 主站 introspection 端点始终返回 client_id，默认开启不影响主站接入；
   * 仅在对接不返回归属字段的第三方端点时才需要显式设为 false（不推荐）。
   */
  strictAudience?: boolean;

  /**
   * 验证模式（默认 "auto"）：
   * - "auto"：配置了 introspectionEndpoint + clientId 时使用 Introspection（可实时感知撤销）；
   *   未配置时回退本地 JWT 验签。
   * - "introspection"：强制 Introspection；未配置端点或 clientId 时抛配置错误。
   * - "local"：仅本地 HS256/RS256 验签（不感知撤销，仅建议非敏感、高吞吐场景）。
   * - "hybrid"：先本地验签，失败后再 Introspection（旧版行为，性能优先）。
   *
   * 涉及账户状态/授权撤销的鉴权建议使用 "auto" 或 "introspection"。
   */
  verificationMode?: "auto" | "introspection" | "local" | "hybrid";

  /**
   * 是否允许 M2M（client_credentials）token 通过用户态校验（默认 false）。
   * M2M token 的 sub 为 `client:<client_id>`，不是用户 ID；若业务确实需要
   * 校验 M2M token，请显式设为 true 并自行区分 client_type。
   */
  allowM2mTokens?: boolean;
}

/**
 * Logout Token jti 防重放存储接口（可注入 Redis 等共享存储实现）。
 *
 * 多实例部署应实现 addIfAbsent（原子 SET NX EX 语义）以保证并发/跨实例下
 * 同一 jti 只会被接受一次。未实现时回退 has + add（非原子，仅建议单实例使用）。
 */
export interface LogoutJtiStore {
  /** 判断 jti 是否已处理过 */
  has(key: string): boolean | Promise<boolean>;
  /** 记录已处理的 jti，ttlSeconds 后过期 */
  add(key: string, ttlSeconds: number): void | Promise<void>;
  /** 原子地"不存在则记录"：返回 true 表示本次成功占用（首次使用），false 表示已存在 */
  addIfAbsent?(key: string, ttlSeconds: number): boolean | Promise<boolean>;
}

export interface VerifiedTokenPayload extends JWTPayload {
  sub: string;
  aud: string;
  iss: string;
  client_id?: string;
  scope?: string;
  phone?: string;
  /** 身份类型：m2m = client_credentials，user = 用户授权码流程 */
  client_type?: "m2m" | "user";
  /** OAuthSession ID；携带 sid 的 token 可被会话级撤销 */
  sid?: string;
  /** 原始认证时间（Unix 秒），供 max_age 判断 */
  auth_time?: number;
  /** DPoP 绑定（RFC 9449 cnf.jkt） */
  cnf?: { jkt?: string };
  /** introspection 返回的 token 类型（Bearer / DPoP） */
  token_type?: "Bearer" | "DPoP";
}

/**
 * Logout Token Payload（RFC 7519 + OIDC Back-Channel Logout 1.0）
 *
 * 主站签发 logout_token 时包含以下字段：
 * - iss: 主站 issuer
 * - aud: 目标 client_id
 * - sub: 用户 ID（与 sid 至少其一）
 * - iat: 签发时间
 * - jti: 唯一 ID（防重放，建议接收方缓存已处理的 jti）
 * - events: { "http://schemas.openid.net/event/backchannel-logout": {} }
 */
export interface LogoutTokenPayload {
  /** JWT type，logout_token 固定值为 "logout_token" */
  type: "logout_token";
  /** 签发者 */
  iss: string;
  /** 目标 audience */
  aud: string;
  /** 用户 ID（Back-Channel Logout 1.0：sub 与 sid 至少其一） */
  sub?: string;
  /** 签发时间（UNIX timestamp） */
  iat: number;
  /** JWT ID（唯一标识，防重放） */
  jti: string;
  /** Backchannel logout 事件声明 */
  events: {
    "http://schemas.openid.net/event/backchannel-logout": Record<string, never>;
  };
  /** sid (Session ID)，可选 */
  sid?: string;
}

interface IntrospectResponse {
  active: boolean;
  sub?: string;
  aud?: string | string[];
  client_id?: string;
  scope?: string;
  exp?: number;
  token_type?: string;
  client_type?: "m2m" | "user";
  sid?: string;
  auth_time?: number;
  cnf?: { jkt?: string };
  [key: string]: unknown;
}

// ============================================
// Introspection 结果缓存
// ============================================

interface IntrospectCacheEntry {
  active: boolean;
  payload: VerifiedTokenPayload | null;
}

function createIntrospectCache(ttlMs: number) {
  return new LRUCache<string, IntrospectCacheEntry>({
    max: 10000,
    ttl: ttlMs,
  });
}

// ============================================
// Logout Token jti 重放防护缓存
// ============================================

/**
 * 已处理的 logout_token jti 缓存。
 * TTL 10 分钟：logout token 本身有效期 5 分钟，留足时钟偏移余量。
 */
const processedLogoutJtis = new LRUCache<string, number>({
  max: 10000,
  ttl: 10 * 60 * 1000,
});

// 废弃的 HS256 logout_token 回退（accessTokenSecret 代验）告警文案，
// 构造时与首次实际使用时复用同一条消息
const LEGACY_LOGOUT_SECRET_FALLBACK_WARNING =
  "[sso-verify] 正在使用 accessTokenSecret 验证 HS256 logout_token（废弃路径）：" +
  "共享 access secret 的服务可伪造任意用户登出。" +
  "请改用 logoutTokenSecret，或配置 logoutTokenPublicKey/jwksUri 走 RS256。";

// 非生产环境下 http:// 非 loopback 端点的告警去重（每个端点名每进程只提示一次）
const warnedInsecureEndpoints = new Set<string>();

// ============================================
// Token Verifier
// ============================================

export function createTokenVerifier(options: SsoVerifierOptions) {
  const {
    audience,
    issuer = "https://nihplod.cn",
    introspectionEndpoint,
    clientId,
    clientSecret,
    accessTokenSecret,
    accessTokenPublicKey,
    jwksUri,
    logoutTokenSecret,
    logoutTokenPublicKey,
    allowLegacyAccessTokenSecretFallback = false,
    introspectCacheTtl = 30 * 1000,
    introspectTimeoutMs = 10 * 1000,
    introspectNegativeCacheTtl = 5 * 1000,
    introspectRetries = 1,
    clockToleranceSeconds = 60,
    logoutJtiStore,
    strictAudience = true,
    verificationMode = "auto",
    allowM2mTokens = false,
  } = options;

  // 一次性告警标志：使用废弃的 accessTokenSecret 回退验证 logout_token 时提示迁移
  let warnedLegacyLogoutSecret = false;

  // 构造时即提示：显式开启回退且该路径实际可生效（有 accessTokenSecret、无 logoutTokenSecret）
  if (allowLegacyAccessTokenSecretFallback && accessTokenSecret && !logoutTokenSecret) {
    console.warn(LEGACY_LOGOUT_SECRET_FALLBACK_WARNING);
  }

  // 端点传输安全：生产环境禁止 http://（introspection 会携带 client_secret）
  // 允许 localhost/127.0.0.1/::1 方便本地联调。
  // 非生产环境下 http:// 非 loopback 端点输出一次性告警（不阻断本地联调）。
  const assertHttpsEndpoint = (value: string | undefined, name: string): void => {
    if (!value) return;
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`[sso-verify] ${name} 不是合法 URL: ${value}`);
    }
    if (url.protocol === "https:") return;
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const isLoopback = host === "localhost" || host === "127.0.0.1" || host === "::1";
    if (url.protocol === "http:" && isLoopback) return;
    if (process.env.NODE_ENV !== "production") {
      if (url.protocol === "http:" && !warnedInsecureEndpoints.has(name)) {
        warnedInsecureEndpoints.add(name);
        console.warn(
          `[sso-verify] ${name} 使用非加密的 http:// 且非 loopback 地址；` +
            "生产环境（NODE_ENV=production）将直接抛错"
        );
      }
      return;
    }
    throw new Error(
      `[sso-verify] 生产环境 ${name} 必须为 https://（当前 ${url.protocol}//${url.host}），` +
        "避免凭证/令牌经明文传输"
    );
  };
  assertHttpsEndpoint(introspectionEndpoint, "introspectionEndpoint");
  assertHttpsEndpoint(jwksUri, "jwksUri");

  const introspectCache = createIntrospectCache(introspectCacheTtl);

  // RS256 JWKS 远程密钥集（延迟初始化）
  let _jwksKeySet: ReturnType<typeof createRemoteJWKSet> | null = null;
  function getJwksKeySet() {
    if (!jwksUri) return null;
    if (!_jwksKeySet) {
      _jwksKeySet = createRemoteJWKSet(new URL(jwksUri), {
        cacheMaxAge: 60 * 60 * 1000, // 1 小时缓存
      });
    }
    return _jwksKeySet;
  }

  // RS256 公钥（延迟导入）
  let _rs256PublicKey: KeyLike | null = null;
  let _rs256KeyInitialized = false;
  async function getRS256PublicKey(): Promise<KeyLike | null> {
    if (!_rs256KeyInitialized) {
      _rs256KeyInitialized = true;
      if (!accessTokenPublicKey) {
        _rs256PublicKey = null;
      } else {
        try {
          _rs256PublicKey = await importSPKI(accessTokenPublicKey, "RS256");
        } catch {
          _rs256PublicKey = null;
        }
      }
    }
    return _rs256PublicKey;
  }

  // Logout Token RS256 公钥（延迟导入，独立密钥对，kid: logout-token-rs256-v1）
  let _logoutRs256PublicKey: KeyLike | null = null;
  let _logoutRs256KeyInitialized = false;
  async function getLogoutRS256PublicKey(): Promise<KeyLike | null> {
    if (!_logoutRs256KeyInitialized) {
      _logoutRs256KeyInitialized = true;
      if (!logoutTokenPublicKey) {
        _logoutRs256PublicKey = null;
      } else {
        try {
          _logoutRs256PublicKey = await importSPKI(logoutTokenPublicKey, "RS256");
        } catch {
          _logoutRs256PublicKey = null;
        }
      }
    }
    return _logoutRs256PublicKey;
  }

  /**
   * Introspection 响应的 aud 归属校验（防 confused deputy）：
   * - 响应携带 aud（字符串或数组）时必须包含配置的 audience；
   * - 否则若携带 client_id，必须等于 audience（audience 即 client_id）；
   * - 两者都缺失时：strictAudience=false 时保持信任（兼容不返回归属字段的端点）；
   *   默认 strictAudience=true 时 fail-closed 拒绝。
   */
  function matchesAudience(data: IntrospectResponse): boolean {
    const aud = data.aud;
    if (typeof aud === "string") return aud === audience;
    if (Array.isArray(aud)) return aud.includes(audience);
    if (typeof data.client_id === "string") return data.client_id === audience;
    return !strictAudience;
  }

  // 同一 token 的并发 introspect 共享同一个 Promise，避免重复请求主站
  const inflightIntrospects = new Map<string, Promise<IntrospectResponse | null>>();

  /**
   * 调用主站 Introspection 端点验证 token
   *
   * Public Client 可省略 client_secret，仅传 client_id。
   * Confidential Client 建议传入 client_secret 以通过端点认证。
   */
  async function introspect(token: string): Promise<IntrospectResponse | null> {
    if (!introspectionEndpoint || !clientId) {
      return null;
    }

    const cached = introspectCache.get(token);
    if (cached) {
      return { active: cached.active, ...(cached.payload || {}) };
    }

    const inflight = inflightIntrospects.get(token);
    if (inflight) {
      return inflight;
    }

    const promise = doIntrospect(token).finally(() => {
      inflightIntrospects.delete(token);
    });
    inflightIntrospects.set(token, promise);
    return promise;
  }

  async function doIntrospect(token: string): Promise<IntrospectResponse | null> {
    const params = new URLSearchParams({ token, client_id: clientId! });
    if (clientSecret) {
      params.set("client_secret", clientSecret);
    }

    // 网络错误 / 5xx 短退避重试（introspectRetries 次），4xx 不重试
    let data: IntrospectResponse | null = null;
    for (let attempt = 0; ; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
      }
      let response: Response;
      try {
        response = await fetch(introspectionEndpoint!, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params,
          redirect: "error",
          signal: AbortSignal.timeout(introspectTimeoutMs),
        });
      } catch {
        if (attempt < introspectRetries) continue;
        return null;
      }
      if (!response.ok) {
        // 5xx 与 429（限流）可重试；429 通常需要更长窗口，但仍先短退避尝试一次
        if ((response.status >= 500 || response.status === 429) && attempt < introspectRetries) {
          continue;
        }
        return null;
      }
      // 响应体非法 JSON（网关/代理返回 HTML、空体、截断 JSON 等）按端点不可用处理：
      // 重试后仍失败则 fail-closed 返回 null，避免异常穿透到 verify/中间件
      try {
        data = (await response.json()) as IntrospectResponse;
      } catch {
        if (attempt < introspectRetries) continue;
        return null;
      }
      break;
    }
    if (!data) return null;

    // active 必须是严格布尔 true：非布尔（如字符串 "false"/1）一律视为不可用
    if (data.active !== true) {
      if (introspectNegativeCacheTtl > 0) {
        introspectCache.set(
          token,
          { active: false, payload: null },
          {
            ttl: introspectNegativeCacheTtl,
          }
        );
      }
      return { active: false };
    }

    // aud 归属不匹配（token 颁发给其他 client）视为无效，按负缓存处理
    if (!matchesAudience(data)) {
      if (introspectNegativeCacheTtl > 0) {
        introspectCache.set(
          token,
          { active: false, payload: null },
          {
            ttl: introspectNegativeCacheTtl,
          }
        );
      }
      return { active: false };
    }

    let payload: VerifiedTokenPayload | null = null;
    if (data.sub) {
      payload = {
        sub: data.sub,
        aud: audience,
        iss: issuer,
        client_id: data.client_id,
        scope: data.scope,
        exp: data.exp,
        ...(data.client_type ? { client_type: data.client_type } : {}),
        ...(data.sid ? { sid: data.sid } : {}),
        ...(typeof data.auth_time === "number" ? { auth_time: data.auth_time } : {}),
        ...(data.cnf ? { cnf: data.cnf } : {}),
        ...(data.token_type === "Bearer" || data.token_type === "DPoP"
          ? { token_type: data.token_type }
          : {}),
      } as VerifiedTokenPayload;
    }

    // 正缓存 TTL 不得超过 token 自身剩余有效期（避免缓存结果比 token 活得更久）；
    // 已过期/无剩余有效期时不缓存。
    let ttl = introspectCacheTtl;
    if (typeof data.exp === "number") {
      ttl = Math.min(ttl, data.exp * 1000 - Date.now());
    }
    if (ttl > 0) {
      introspectCache.set(token, { active: true, payload }, { ttl });
    }
    return data;
  }

  /**
   * 本地验签路径返回的是 token 原始 payload：主站 access token 把用户 ID
   * 放在 `id` claim（`sub` 只存在于 id_token 与 introspect 响应）。此处
   * 归一化为 `sub`，保持与 introspect 路径一致的返回契约——消费方
   * （session-init / getSessionUser 等）一律读 payload.sub。
   * 两者皆无时视为无效 token（对齐 introspect 路径"必须有非空 sub"的口径）。
   */
  function normalizeLocalPayload(payload: JWTPayload): VerifiedTokenPayload | null {
    const p = payload as VerifiedTokenPayload & { id?: string };
    if (!p.sub && typeof p.id === "string" && p.id) {
      p.sub = p.id;
    }
    return p.sub ? p : null;
  }

  /**
   * 本地 JWT 验证（仅当提供 accessTokenSecret 时，使用 HS256）
   */
  async function verifyLocally(token: string): Promise<VerifiedTokenPayload | null> {
    if (!accessTokenSecret) return null;

    try {
      const secret = new TextEncoder().encode(accessTokenSecret);
      const { payload } = await jwtVerify(token, secret, {
        issuer,
        audience,
        algorithms: ["HS256"],
        requiredClaims: ["exp"],
        clockTolerance: clockToleranceSeconds,
      });

      if ((payload as { type?: string }).type !== "access_token") {
        return null;
      }

      return normalizeLocalPayload(payload);
    } catch {
      return null;
    }
  }

  /**
   * RS256 本地验证（优先直接公钥，验证失败回退 JWKS 远程获取）
   */
  async function verifyWithRS256(token: string): Promise<VerifiedTokenPayload | null> {
    // 检查是否有 RS256 验证能力
    const hasPublicKey = Boolean(accessTokenPublicKey);
    const hasJwks = Boolean(jwksUri);
    if (!hasPublicKey && !hasJwks) return null;

    try {
      // 优先使用直接公钥；验证失败（如主站轮换密钥后本地公钥过期）
      // 时回退 JWKS，而不是直接判定失败
      const directKey = await getRS256PublicKey();
      if (directKey) {
        try {
          const { payload } = await jwtVerify(token, directKey, {
            issuer,
            audience,
            algorithms: ["RS256"],
            requiredClaims: ["exp"],
            clockTolerance: clockToleranceSeconds,
          });
          if ((payload as { type?: string }).type !== "access_token") return null;
          return normalizeLocalPayload(payload);
        } catch {
          // 直接公钥验证失败，继续尝试 JWKS
        }
      }

      // 回退到 JWKS 远程获取
      const jwks = getJwksKeySet();
      if (jwks) {
        const { payload } = await jwtVerify(token, jwks, {
          issuer,
          audience,
          algorithms: ["RS256"],
          requiredClaims: ["exp"],
          clockTolerance: clockToleranceSeconds,
        });
        if ((payload as { type?: string }).type !== "access_token") return null;
        return normalizeLocalPayload(payload);
      }

      return null;
    } catch {
      return null;
    }
  }

  const hasIntrospection = Boolean(introspectionEndpoint && clientId);

  /**
   * M2M token 默认拒绝用户态校验：其 sub 是 `client:<id>`，不是用户 ID。
   * 需要校验 M2M token 的服务显式设置 allowM2mTokens: true，并自行区分 client_type。
   */
  const rejectM2mPayload = (payload: VerifiedTokenPayload | null): VerifiedTokenPayload | null => {
    if (!payload || allowM2mTokens) return payload;
    const isM2m = payload.client_type === "m2m" || payload.sub.startsWith("client:");
    return isM2m ? null : payload;
  };

  const verifyLocallyBoth = async (rawToken: string): Promise<VerifiedTokenPayload | null> => {
    // 1. HS256 本地验证（适用于共享 secret 的内部服务）
    if (accessTokenSecret) {
      const local = await verifyLocally(rawToken);
      if (local) return local;
    }
    // 2. RS256 本地验证（适用于已迁移到非对称签名的子项目）
    return verifyWithRS256(rawToken);
  };

  const verifyViaIntrospection = async (rawToken: string): Promise<VerifiedTokenPayload | null> => {
    const result = await introspect(rawToken);
    // active 必须严格为 true，且必须携带非空 sub，否则视为无效（防 confused deputy）
    if (result?.active !== true || !result.sub) return null;
    return {
      sub: result.sub,
      aud: audience,
      iss: issuer,
      client_id: result.client_id,
      scope: result.scope,
      exp: result.exp,
      ...(result.client_type ? { client_type: result.client_type } : {}),
      ...(result.sid ? { sid: result.sid } : {}),
      ...(typeof result.auth_time === "number" ? { auth_time: result.auth_time } : {}),
      ...(result.cnf ? { cnf: result.cnf } : {}),
      ...(result.token_type ? { token_type: result.token_type } : {}),
    } as VerifiedTokenPayload;
  };

  return {
    /**
     * 验证 Access Token
     *
     * 模式由 verificationMode 控制（默认 "auto"）：
     * - auto：配置了 Introspection 时优先 Introspection（实时感知撤销）；否则本地验签。
     * - introspection：强制 Introspection（缺少端点或 clientId 时抛配置错误）。
     * - local：仅本地验签（不感知撤销）。
     * - hybrid：本地优先，失败后 Introspection（旧版行为）。
     *
     * @returns token payload 或者 null（验证失败）
     */
    async verify(rawToken: string): Promise<VerifiedTokenPayload | null> {
      const runLocal = async () => rejectM2mPayload(await verifyLocallyBoth(rawToken));
      const runIntrospection = async () => rejectM2mPayload(await verifyViaIntrospection(rawToken));

      if (verificationMode === "local") {
        return await runLocal();
      }
      if (verificationMode === "introspection") {
        if (!hasIntrospection) {
          throw new Error(
            "[sso-verify] verificationMode=introspection 必须配置 introspectionEndpoint 与 clientId"
          );
        }
        return await runIntrospection();
      }
      if (verificationMode === "hybrid") {
        const local = await runLocal();
        if (local) return local;
        return hasIntrospection ? await runIntrospection() : null;
      }
      // auto：Introspection 配置存在时默认走 Introspection，避免本地验签绕过撤销。
      return hasIntrospection ? await runIntrospection() : await runLocal();
    },

    /**
     * 直接调用 Introspection 端点
     */
    introspect,

    /**
     * 清除指定 token 的 Introspection 缓存
     */
    invalidateCache(token: string): void {
      introspectCache.delete(token);
    },

    /**
     * 验证 Logout Token（Back-Channel Logout）
     *
     * 用于子项目接收主站 backchannel logout 通知时验证 logout_token。
     * 验证要求（OIDC Back-Channel Logout 1.0）：
     * 1. type === "logout_token"
     * 2. iss 匹配配置的 issuer
     * 3. aud 包含当前 client_id
     * 4. exp 存在（规范要求）
     * 5. events 包含 backchannel-logout 事件，且事件值为对象
     * 6. sub 或 sid 至少其一（§2.4，否则无法定位要终止的会话）
     *
     * @returns LogoutTokenPayload 或 null（验证失败）
     */
    async verifyLogoutToken(token: string): Promise<LogoutTokenPayload | null> {
      // 辅助：通用 payload 校验（type / exp / events / jti 防重放）
      const validateLogoutPayload = async (
        payload: Record<string, unknown>
      ): Promise<LogoutTokenPayload | null> => {
        if ((payload as { type?: string }).type !== "logout_token") {
          return null;
        }
        // 规范要求 logout_token 必须携带 exp / iat，且不得携带 nonce
        if (typeof (payload as { exp?: unknown }).exp !== "number") {
          return null;
        }
        if (typeof (payload as { iat?: unknown }).iat !== "number") {
          return null;
        }
        if ((payload as { nonce?: unknown }).nonce !== undefined) {
          return null;
        }
        const events = (payload as { events?: Record<string, unknown> }).events;
        const logoutEvent = events?.["http://schemas.openid.net/event/backchannel-logout"];
        // 事件值必须是对象（通常为空对象 {}）
        if (!logoutEvent || typeof logoutEvent !== "object" || Array.isArray(logoutEvent)) {
          return null;
        }
        const jti = (payload as { jti?: string }).jti;
        if (!jti || typeof jti !== "string") {
          return null;
        }
        // Back-Channel Logout 1.0 §2.4：sub 与 sid 至少存在一个，
        // 否则无法定位要终止的会话/用户，按验证失败处理
        const sub = (payload as { sub?: unknown }).sub;
        const sid = (payload as { sid?: unknown }).sid;
        const hasSub = typeof sub === "string" && sub.length > 0;
        const hasSid = typeof sid === "string" && sid.length > 0;
        if (!hasSub && !hasSid) {
          return null;
        }
        // jti 缓存 key 带 issuer 前缀，避免跨 issuer / 跨 verifier 实例的 jti 冲突
        const iss = (payload as { iss?: string }).iss || issuer;
        const jtiKey = `${iss}:${jti}`;
        if (logoutJtiStore) {
          // 优先原子接口（Redis SET NX EX 等）：消除 has + add 之间的 TOCTOU 窗口
          if (typeof logoutJtiStore.addIfAbsent === "function") {
            const firstUse = await logoutJtiStore.addIfAbsent(jtiKey, 10 * 60);
            if (!firstUse) return null;
          } else {
            // 兼容旧实现：has + add 非原子，并发/跨实例下可能重复接受同一 jti；
            // 多实例部署请补充 addIfAbsent 实现
            if (await logoutJtiStore.has(jtiKey)) {
              return null;
            }
            await logoutJtiStore.add(jtiKey, 10 * 60);
          }
        } else {
          if (processedLogoutJtis.has(jtiKey)) {
            return null;
          }
          processedLogoutJtis.set(jtiKey, Date.now());
        }
        return payload as unknown as LogoutTokenPayload;
      };

      // 按 JWT header alg 分发，避免跨算法静默回退
      let alg: string | undefined;
      try {
        alg = decodeProtectedHeader(token).alg;
      } catch {
        return null;
      }

      // 1. RS256：使用 logout token 独立公钥（logoutTokenPublicKey）或 JWKS（按 kid 匹配）。
      //    直接公钥验证失败（如密钥轮换后本地公钥过期）时回退 JWKS；
      //    无任何可用公钥时直接失败，不回退 HS256。
      if (alg === "RS256") {
        const directKey = await getLogoutRS256PublicKey();
        if (directKey) {
          try {
            const { payload } = await jwtVerify(token, directKey, {
              issuer,
              audience,
              algorithms: ["RS256"],
              requiredClaims: ["exp"],
              clockTolerance: clockToleranceSeconds,
            });
            return await validateLogoutPayload(payload as unknown as Record<string, unknown>);
          } catch {
            // 直接公钥验证失败，继续尝试 JWKS
          }
        }

        // jwksUri 非法（或生产环境非 https）时 getJwksKeySet 可能抛错：
        // 与 verify() 一致按验证失败处理，而不是异常穿透
        let jwks: ReturnType<typeof getJwksKeySet> = null;
        try {
          jwks = getJwksKeySet();
        } catch {
          return null;
        }
        if (jwks) {
          try {
            const { payload } = await jwtVerify(token, jwks, {
              issuer,
              audience,
              algorithms: ["RS256"],
              requiredClaims: ["exp"],
              clockTolerance: clockToleranceSeconds,
            });
            return await validateLogoutPayload(payload as unknown as Record<string, unknown>);
          } catch {
            return null;
          }
        }

        return null;
      }

      // 2. HS256：使用 logoutTokenSecret（专用密钥）；回退 accessTokenSecret 默认关闭
      if (alg === "HS256") {
        const secret =
          logoutTokenSecret ||
          (allowLegacyAccessTokenSecretFallback ? accessTokenSecret : undefined);
        if (!secret) return null;
        if (!logoutTokenSecret && allowLegacyAccessTokenSecretFallback) {
          if (!warnedLegacyLogoutSecret) {
            warnedLegacyLogoutSecret = true;
            console.warn(LEGACY_LOGOUT_SECRET_FALLBACK_WARNING);
          }
        }

        try {
          const key = new TextEncoder().encode(secret);
          const { payload } = await jwtVerify(token, key, {
            issuer,
            audience,
            algorithms: ["HS256"],
            requiredClaims: ["exp"],
            clockTolerance: clockToleranceSeconds,
          });
          return await validateLogoutPayload(payload as unknown as Record<string, unknown>);
        } catch {
          return null;
        }
      }

      return null;
    },
  };
}

/** 框架无关的最小中间件请求类型（兼容 Express/Connect 风格） */
export interface SsoMiddlewareRequest {
  headers?: Record<string, string | undefined>;
  /** 验证通过后由中间件挂载的用户信息 */
  user?: VerifiedTokenPayload;
  [key: string]: unknown;
}

/** 框架无关的最小中间件响应类型 */
export interface SsoMiddlewareResponse {
  status?: (code: number) => { json: (body: unknown) => unknown };
  [key: string]: unknown;
}

/**
 * Express/Next.js 兼容中间件
 *
 * 使用示例（Express）:
 * ```typescript
 * app.use(ssoMiddleware({
 *   introspectionEndpoint: "https://nihplod.cn/api/oauth/introspect",
 *   clientId: "advisor",
 *   clientSecret: "SECRET",
 *   audience: "advisor",
 * }));
 * ```
 *
 * 使用示例（Next.js Route Handler）:
 * ```typescript
 * const verifier = createTokenVerifier({ ... });
 * export async function GET(request: NextRequest) {
 *   const token = request.headers.get("authorization")?.replace("Bearer ", "");
 *   const payload = token ? await verifier.verify(token) : null;
 *   if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 *   // ...
 * }
 * ```
 */
export function ssoMiddleware(options: SsoVerifierOptions) {
  const verifier = createTokenVerifier(options);

  return async (
    req: SsoMiddlewareRequest,
    res: SsoMiddlewareResponse,
    next: (err?: unknown) => void
  ) => {
    const authHeader = req.headers?.authorization || req.headers?.Authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      if (res.status) {
        res.status(401).json({ error: "Unauthorized", message: "请提供 Bearer token" });
        return;
      }
      // res 不支持 status/json 时通过 next(err) 交由错误处理中间件，避免请求挂起
      next(new Error("Unauthorized: 请提供 Bearer token"));
      return;
    }

    const payload = await verifier.verify(token);
    if (!payload) {
      if (res.status) {
        res.status(401).json({ error: "Unauthorized", message: "Token 无效或已过期" });
        return;
      }
      next(new Error("Unauthorized: Token 无效或已过期"));
      return;
    }

    // 挂载用户信息到请求对象
    req.user = payload;
    next();
  };
}

/**
 * 创建 Logout Token 专用验证器
 *
 * 适用于仅需处理 backchannel logout 的子项目。
 * 内部调用 createTokenVerifier 并暴露 verifyLogoutToken 方法。
 *
 * 使用示例：
 * ```typescript
 * import { createLogoutTokenVerifier } from "@nihplod/sso-verify";
 *
 * const logoutVerifier = createLogoutTokenVerifier({
 *   audience: "advisor",
 *   issuer: "https://nihplod.cn",
 *   logoutTokenSecret: process.env.LOGOUT_TOKEN_SECRET,
 * });
 *
 * // 在 backchannel logout 端点中：
 * app.post("/api/auth/backchannel-logout", async (req, res) => {
 *   const token = req.body.logout_token;
 *   const payload = await logoutVerifier.verify(token);
 *   if (payload) {
 *     await clearUserSession(payload.sub);
 *     res.status(200).end();
 *   } else {
 *     res.status(400).end();
 *   }
 * });
 * ```
 */
export function createLogoutTokenVerifier(options: SsoVerifierOptions) {
  const verifier = createTokenVerifier(options);

  return {
    /**
     * 验证 logout_token
     */
    async verify(token: string): Promise<LogoutTokenPayload | null> {
      return verifier.verifyLogoutToken(token);
    },
  };
}
