/**
 * @nihplod/sso-verify
 *
 * NIHPLOD 一网通 SSO Token 验证工具包
 *
 * 供子项目在后端验证主站签发的 Access Token。
 *
 * 由于主站当前使用 HS256 对称签名，JWKS 端点不公开签名密钥，
 * 因此本工具包默认采用 OAuth 2.0 Token Introspection（RFC 7662）
 * 端点进行验证。对于已知共享密钥的内部服务，也可传入
 * accessTokenSecret 做本地 JWT 验证。
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
   * 推荐优先使用，适配当前 HS256 对称签名场景。
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
   * 主站已迁移至 RS256 签名，子项目可传入此公钥进行本地验证，
   * 避免每次都调用 Introspection 端点。
   */
  accessTokenPublicKey?: string;

  /**
   * JWKS 端点 URL（可选）。
   * 子项目可传入此 URL 以动态获取 RS256 公钥进行本地验证。
   * 当 accessTokenPublicKey 未配置时，将通过此端点获取匹配 kid 的公钥。
   */
  jwksUri?: string;

  /**
   * Logout Token Secret（可选）。
   * 用于本地验证主站签发的 logout_token（HS256 签名）。
   * 若未提供，将回退使用 accessTokenSecret 进行验证。
   */
  logoutTokenSecret?: string;

  /**
   * Logout Token RS256 公钥（PEM 格式，可选）。
   * 主站 logout_token 使用独立密钥对（kid: logout-token-rs256-v1）签名，
   * 与 access token 密钥不同，因此不能使用 accessTokenPublicKey 验证。
   * 若未提供但配置了 jwksUri，将通过 JWKS 按 kid 匹配获取对应公钥。
   * RS256 签名的 logout_token 在无任何可用公钥时验证失败（返回 null），
   * 不会静默回退到 HS256。
   */
  logoutTokenPublicKey?: string;

  /**
   * Introspection 请求失败重试次数，默认 1。
   * 仅对网络错误与 5xx 响应重试（短退避），4xx 不重试。
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
}

/**
 * Logout Token jti 防重放存储接口（可注入 Redis 等共享存储实现）。
 * has/add 均支持同步或异步返回。
 */
export interface LogoutJtiStore {
  /** 判断 jti 是否已处理过 */
  has(key: string): boolean | Promise<boolean>;
  /** 记录已处理的 jti，ttlSeconds 后过期 */
  add(key: string, ttlSeconds: number): void | Promise<void>;
}

export interface VerifiedTokenPayload extends JWTPayload {
  sub: string;
  aud: string;
  iss: string;
  client_id?: string;
  scope?: string;
  phone?: string;
}

/**
 * Logout Token Payload（RFC 7519 + OIDC Back-Channel Logout 1.0）
 *
 * 主站签发 logout_token 时包含以下字段：
 * - iss: 主站 issuer
 * - aud: 目标 client_id
 * - sub: 用户 ID
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
  /** 用户 ID */
  sub: string;
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
    introspectCacheTtl = 30 * 1000,
    introspectTimeoutMs = 10 * 1000,
    introspectNegativeCacheTtl = 5 * 1000,
    introspectRetries = 1,
    clockToleranceSeconds = 60,
    logoutJtiStore,
  } = options;

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
   * - 两者都缺失时保持信任（兼容不返回归属字段的端点，见 README）。
   */
  function matchesAudience(data: IntrospectResponse): boolean {
    const aud = data.aud;
    if (typeof aud === "string") return aud === audience;
    if (Array.isArray(aud)) return aud.includes(audience);
    if (typeof data.client_id === "string") return data.client_id === audience;
    return true;
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
          signal: AbortSignal.timeout(introspectTimeoutMs),
        });
      } catch {
        if (attempt < introspectRetries) continue;
        return null;
      }
      if (!response.ok) {
        if (response.status >= 500 && attempt < introspectRetries) continue;
        return null;
      }
      data = (await response.json()) as IntrospectResponse;
      break;
    }
    if (!data) return null;

    // aud 归属不匹配（token 颁发给其他 client）视为无效，按负缓存处理
    if (data.active && !matchesAudience(data)) {
      if (introspectNegativeCacheTtl > 0) {
        introspectCache.set(token, { active: false, payload: null }, {
          ttl: introspectNegativeCacheTtl,
        });
      }
      return { active: false };
    }

    let payload: VerifiedTokenPayload | null = null;
    if (data.active && data.sub) {
      payload = {
        sub: data.sub,
        aud: audience,
        iss: issuer,
        client_id: data.client_id,
        scope: data.scope,
        exp: data.exp,
      } as VerifiedTokenPayload;
    }

    // active:false（已撤销）结果使用更短的 TTL，降低撤销生效延迟；
    // introspectNegativeCacheTtl 为 0 时不缓存。
    if (data.active) {
      introspectCache.set(token, { active: true, payload });
    } else if (introspectNegativeCacheTtl > 0) {
      introspectCache.set(token, { active: false, payload: null }, {
        ttl: introspectNegativeCacheTtl,
      });
    }
    return data;
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
        clockTolerance: clockToleranceSeconds,
      });

      if ((payload as { type?: string }).type !== "access_token") {
        return null;
      }

      return payload as unknown as VerifiedTokenPayload;
    } catch {
      return null;
    }
  }

  /**
   * RS256 本地验证（优先直接公钥，其次 JWKS 远程获取）
   */
  async function verifyWithRS256(token: string): Promise<VerifiedTokenPayload | null> {
    // 检查是否有 RS256 验证能力
    const hasPublicKey = Boolean(accessTokenPublicKey);
    const hasJwks = Boolean(jwksUri);
    if (!hasPublicKey && !hasJwks) return null;

    try {
      // 优先使用直接公钥
      const directKey = await getRS256PublicKey();
      if (directKey) {
        const { payload } = await jwtVerify(token, directKey, {
          issuer,
          audience,
          algorithms: ["RS256"],
          clockTolerance: clockToleranceSeconds,
        });
        if ((payload as { type?: string }).type !== "access_token") return null;
        return payload as unknown as VerifiedTokenPayload;
      }

      // 回退到 JWKS 远程获取
      const jwks = getJwksKeySet();
      if (jwks) {
        const { payload } = await jwtVerify(token, jwks, {
          issuer,
          audience,
          algorithms: ["RS256"],
          clockTolerance: clockToleranceSeconds,
        });
        if ((payload as { type?: string }).type !== "access_token") return null;
        return payload as unknown as VerifiedTokenPayload;
      }

      return null;
    } catch {
      return null;
    }
  }

  return {
    /**
     * 验证 Access Token
     *
     * 验证顺序：
     * 1. 若配置了 accessTokenSecret，先尝试 HS256 本地验证
     * 2. 若配置了 accessTokenPublicKey 或 jwksUri，尝试 RS256 本地验证
     * 3. 若上述均失败/未配置，调用 Introspection 端点
     *
     * @returns token payload 或者 null（验证失败）
     */
    async verify(token: string): Promise<VerifiedTokenPayload | null> {
      // 1. HS256 本地验证（优先速度，适用于共享 secret 的内部服务）
      if (accessTokenSecret) {
        const local = await verifyLocally(token);
        if (local) return local;
      }

      // 2. RS256 本地验证（适用于已迁移到非对称签名的子项目）
      const rs256Result = await verifyWithRS256(token);
      if (rs256Result) return rs256Result;

      // 3. Introspection 验证（兜底方案）
      const result = await introspect(token);
      // active:true 必须携带非空 sub，否则视为无效（防 confused deputy）
      if (!result?.active || !result.sub) return null;

      return {
        sub: result.sub,
        aud: audience,
        iss: issuer,
        client_id: result.client_id,
        scope: result.scope,
        exp: result.exp,
      } as VerifiedTokenPayload;
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
        // 规范要求 logout_token 必须携带 exp
        if (typeof (payload as { exp?: unknown }).exp !== "number") {
          return null;
        }
        const events = (payload as { events?: Record<string, unknown> }).events;
        const logoutEvent =
          events?.["http://schemas.openid.net/event/backchannel-logout"];
        // 事件值必须是对象（通常为空对象 {}）
        if (
          !logoutEvent ||
          typeof logoutEvent !== "object" ||
          Array.isArray(logoutEvent)
        ) {
          return null;
        }
        const jti = (payload as { jti?: string }).jti;
        if (!jti || typeof jti !== "string") {
          return null;
        }
        // jti 缓存 key 带 issuer 前缀，避免跨 issuer / 跨 verifier 实例的 jti 冲突
        const iss = (payload as { iss?: string }).iss || issuer;
        const jtiKey = `${iss}:${jti}`;
        if (logoutJtiStore) {
          // 注入了外部存储（多实例部署应注入共享存储，如 Redis）
          if (await logoutJtiStore.has(jtiKey)) {
            return null;
          }
          await logoutJtiStore.add(jtiKey, 10 * 60);
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
      //    无任何可用公钥时直接失败，不回退 HS256。
      if (alg === "RS256") {
        const directKey = await getLogoutRS256PublicKey();
        if (directKey) {
          try {
            const { payload } = await jwtVerify(token, directKey, {
              issuer,
              audience,
              algorithms: ["RS256"],
              clockTolerance: clockToleranceSeconds,
            });
            return await validateLogoutPayload(payload as unknown as Record<string, unknown>);
          } catch {
            return null;
          }
        }

        const jwks = getJwksKeySet();
        if (jwks) {
          try {
            const { payload } = await jwtVerify(token, jwks, {
              issuer,
              audience,
              algorithms: ["RS256"],
              clockTolerance: clockToleranceSeconds,
            });
            return await validateLogoutPayload(payload as unknown as Record<string, unknown>);
          } catch {
            return null;
          }
        }

        return null;
      }

      // 2. HS256：使用 logoutTokenSecret（显式配置）或 accessTokenSecret 本地验证
      if (alg === "HS256") {
        const secret = logoutTokenSecret || accessTokenSecret;
        if (!secret) return null;

        try {
          const key = new TextEncoder().encode(secret);
          const { payload } = await jwtVerify(token, key, {
            issuer,
            audience,
            algorithms: ["HS256"],
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

  return async (req: SsoMiddlewareRequest, res: SsoMiddlewareResponse, next: (err?: unknown) => void) => {
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
