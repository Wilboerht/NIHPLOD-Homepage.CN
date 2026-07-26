/**
 * @nihplod/sso-verify
 * 
 * NIHPLOD 一网通 SSO Token 验证工具包
 * 
 * 供子项目在后端验证主站签发的 Access Token，
 * 支持从主站 JWKS 端点获取密钥并本地验证 JWT 签名。
 * 
 * 安装：npm install @nihplod/sso-verify
 * 
 * 使用：
 * ```typescript
 * import { createTokenVerifier } from "@nihplod/sso-verify";
 * const verifier = createTokenVerifier({
 *   jwksUri: "https://nihplod.cn/api/oauth/jwks.json",
 *   audience: "advisor",
 *   issuer: "https://nihplod.cn",
 * });
 * 
 * // 验证 token
 * const payload = await verifier.verify(token);
 * if (payload) {
 *   console.log(payload.sub); // 用户 ID
 * }
 * ```
 */

import { jwtVerify } from "jose";
import { LRUCache } from "lru-cache";

// ============================================
// 类型定义
// ============================================

export interface SsoVerifierOptions {
  /** 主站 JWKS 端点 URL */
  jwksUri: string;
  /** 期望的 audience（对应子项目的 client_id） */
  audience: string;
  /** 期望的 issuer（主站 URL） */
  issuer?: string;
  /** JWKS 缓存 TTL（毫秒），默认 1 小时 */
  jwksCacheTtl?: number;
  /** Token Introspection 端点（可选的额外检查） */
  introspectionEndpoint?: string;
  /** 子项目的 client_id（用于 introspection） */
  clientId?: string;
  /** 子项目的 client_secret（用于 introspection） */
  clientSecret?: string;
}

export interface VerifiedTokenPayload {
  sub: string;
  aud: string;
  iss: string;
  iat: number;
  exp: number;
  client_id?: string;
  scope?: string;
  phone?: string;
}

export interface UserStatusCacheEntry {
  status: string;
  updatedAt: number;
}

// ============================================
// JWKS 获取与缓存
// ============================================

interface JwksKey {
  kty: string;
  kid: string;
  alg: string;
  k: string;
}

const jwksCache = new LRUCache<string, JwksKey[]>({
  max: 10,
  ttl: 60 * 60 * 1000, // 默认 1 小时
});

async function fetchJwks(jwksUri: string, cacheTtl?: number): Promise<JwksKey[]> {
  // 检查缓存
  const cached = jwksCache.get(jwksUri);
  if (cached) return cached;

  const response = await fetch(jwksUri);
  if (!response.ok) {
    throw new Error(`[SSO Verify] 获取 JWKS 失败: HTTP ${response.status}`);
  }

  const data = await response.json();
  const keys = data.keys || [];

  // 设置缓存
  jwksCache.set(jwksUri, keys, { ttl: cacheTtl || 60 * 60 * 1000 });

  return keys;
}

// 强制刷新 JWKS 缓存（在验证失败时使用）
function invalidateJwksCache(jwksUri: string): void {
  jwksCache.delete(jwksUri);
}

// ============================================
// 用户状态缓存
// ============================================

const statusCache = new LRUCache<string, UserStatusCacheEntry>({
  max: 10000,
  ttl: 60 * 1000, // 60 秒 TTL
});

// ============================================
// Token Verifier
// ============================================

export function createTokenVerifier(options: SsoVerifierOptions) {
  const {
    jwksUri,
    audience,
    issuer = "https://nihplod.cn",
    jwksCacheTtl,
    introspectionEndpoint,
    clientId,
    clientSecret,
  } = options;

  return {
    /**
     * 验证 Access Token
     * @returns token payload 或者 null（验证失败）
     */
    async verify(token: string): Promise<VerifiedTokenPayload | null> {
      try {
        // 1. 尝试本地 JWT 验证
        const keys = await fetchJwks(jwksUri, jwksCacheTtl);

        // HS256 对称密钥：从 JWKS 获取共享密钥
        const key = keys.find((k) => k.alg === "HS256" && k.kid === "access-token-v1");
        if (!key) {
          // 尝试其他算法
          let verified = false;
          let payload: any = null;

          for (const k of keys) {
            try {
              const secret = Buffer.from(k.k, "base64url");
              const result = await jwtVerify(token, secret, {
                issuer,
                audience,
              });
              payload = result.payload;
              verified = true;
              break;
            } catch {
              continue;
            }
          }

          if (!verified) {
            // JWKS 验证失败，强制刷新缓存后重试
            invalidateJwksCache(jwksUri);
            return null;
          }

          // 2. 可选：Token Introspection（额外检查是否被吊销）
          if (introspectionEndpoint && clientId && clientSecret) {
            const active = await this.introspect(token);
            if (!active) return null;
          }

          return payload as unknown as VerifiedTokenPayload;
        }

        const secret = Buffer.from(key.k, "base64url");
        const { payload } = await jwtVerify(token, secret, {
          issuer,
          audience,
        });

        // 2. 可选：Token Introspection
        if (introspectionEndpoint && clientId && clientSecret) {
          const active = await this.introspect(token);
          if (!active) return null;
        }

        return payload as unknown as VerifiedTokenPayload;
      } catch {
        // 验证失败，清除 JWKS 缓存再试一次
        invalidateJwksCache(jwksUri);
        return null;
      }
    },

    /**
     * 调用主站 Introspection 端点验证 token
     */
    async introspect(token: string): Promise<boolean> {
      if (!introspectionEndpoint || !clientId || !clientSecret) {
        return true; // 未配置 introspection，默认通过
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

        if (!response.ok) return false;
        const data = await response.json();
        return data.active === true;
      } catch {
        return false;
      }
    },

    /**
     * 查询用户状态（带缓存）
     */
    async getUserStatus(userId: string, internalApiBase?: string): Promise<string> {
      // 检查缓存
      const cached = statusCache.get(userId);
      if (cached) return cached.status;

      try {
        const baseUrl = internalApiBase || "https://nihplod.cn";
        const response = await fetch(`${baseUrl}/api/v1/internal/user/status`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // 注意：需要子项目配置内部 API 密钥
            "X-Internal-API-Key": clientId || "",
          },
          body: JSON.stringify({ userId }),
        });

        if (!response.ok) return "UNKNOWN";
        const data = await response.json();

        if (data.success && data.data) {
          const status = data.data.status;
          statusCache.set(userId, {
            status,
            updatedAt: Date.now(),
          });
          return status;
        }
        return "UNKNOWN";
      } catch {
        return "UNKNOWN";
      }
    },

    /**
     * 使特定用户的状态缓存失效
     */
    invalidateStatusCache(userId: string): void {
      statusCache.delete(userId);
    },
  };
}

/**
 * Express/Next.js 兼容中间件
 * 
 * 使用示例（Express）:
 * ```typescript
 * app.use(ssoMiddleware({ jwksUri: "...", audience: "advisor" }));
 * ```
 * 
 * 使用示例（Next.js Route Handler）:
 * ```typescript
 * const verifier = createTokenVerifier({ jwksUri: "...", audience: "advisor" });
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
