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

import { jwtVerify, type JWTPayload } from "jose";
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
}

export interface VerifiedTokenPayload extends JWTPayload {
  sub: string;
  aud: string;
  iss: string;
  client_id?: string;
  scope?: string;
  phone?: string;
}

interface IntrospectResponse {
  active: boolean;
  sub?: string;
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
    introspectCacheTtl = 30 * 1000,
  } = options;

  const introspectCache = createIntrospectCache(introspectCacheTtl);

  /**
   * 调用主站 Introspection 端点验证 token
   */
  async function introspect(token: string): Promise<IntrospectResponse | null> {
    if (!introspectionEndpoint || !clientId || !clientSecret) {
      return null;
    }

    const cached = introspectCache.get(token);
    if (cached) {
      return { active: cached.active, ...(cached.payload || {}) };
    }

    try {
      const response = await fetch(introspectionEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });

      if (!response.ok) return null;
      const data = (await response.json()) as IntrospectResponse;

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

      introspectCache.set(token, { active: data.active, payload });
      return data;
    } catch {
      return null;
    }
  }

  /**
   * 本地 JWT 验证（仅当提供 accessTokenSecret 时）
   */
  async function verifyLocally(token: string): Promise<VerifiedTokenPayload | null> {
    if (!accessTokenSecret) return null;

    try {
      const secret = new TextEncoder().encode(accessTokenSecret);
      const { payload } = await jwtVerify(token, secret, {
        issuer,
        audience,
      });

      if ((payload as { type?: string }).type !== "access_token") {
        return null;
      }

      return payload as unknown as VerifiedTokenPayload;
    } catch {
      return null;
    }
  }

  return {
    /**
     * 验证 Access Token
     *
     * 验证顺序：
     * 1. 若配置了 accessTokenSecret，先尝试本地 JWT 验证
     * 2. 否则/失败后，调用 Introspection 端点
     *
     * @returns token payload 或者 null（验证失败）
     */
    async verify(token: string): Promise<VerifiedTokenPayload | null> {
      // 1. 本地验证（优先速度，适用于共享 secret 的内部服务）
      if (accessTokenSecret) {
        const local = await verifyLocally(token);
        if (local) return local;
      }

      // 2. Introspection 验证（推荐，适配当前 HS256 不公开密钥的场景）
      const result = await introspect(token);
      if (!result?.active) return null;

      return {
        sub: result.sub || "",
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
  };
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

  return async (req: any, res: any, next: () => void) => {
    const authHeader = req.headers?.authorization || req.headers?.Authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      if (res.status) {
        res.status(401).json({ error: "Unauthorized", message: "请提供 Bearer token" });
      }
      return;
    }

    const payload = await verifier.verify(token);
    if (!payload) {
      if (res.status) {
        res.status(401).json({ error: "Unauthorized", message: "Token 无效或已过期" });
      }
      return;
    }

    // 挂载用户信息到请求对象
    req.user = payload;
    next();
  };
}
