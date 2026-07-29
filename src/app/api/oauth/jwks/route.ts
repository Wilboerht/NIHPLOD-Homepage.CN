/**
 * JWKS (JSON Web Key Set) 端点
 * GET /api/oauth/jwks.json
 *
 * ⚠️ 安全警告：当前使用 HS256 对称密钥。
 * 对称密钥无法安全地通过 JWKS 公开分发，因此本端点**不暴露** k 值。
 *
 * 推荐做法：
 *   1. 子项目使用 Introspection 端点验证 token（`POST /api/oauth/introspect`）
 *   2. 若确需本地验证，使用共享的环境变量 JWT_ACCESS_SECRET 自行计算
 *   3. 计划升级至 RS256 非对称密钥后，本端点将公开公钥用于第三方验证
 *
 * 迁移路线图：
 *   Phase 1: 生成 RSA 密钥对，同时支持 HS256 + RS256（2 周内）
 *   Phase 2: 子项目迁移至 RS256 验证（2-4 周）
 *   Phase 3: 移除 HS256，JWKS 端点正式公开 RSA 公钥（4 周后）
 *
 * 当前缓解措施：
 *   - 速率限制（IP 级）
 *   - 仅返回 key 标识符（kid），不返回签名密钥
 *   - 生产环境通过反向代理限制访问来源 IP
 */
import { NextResponse } from "next/server";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { getAccessPublicKey, getIdTokenPublicKey } from "@/lib/jwt";

export const dynamic = "force-dynamic";

// 内存缓存 JWKS 响应（1 小时 TTL）
let cachedJWKS: { body: string; timestamp: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 小时

/**
 * 获取 JWKS 的 kid 标识符（不暴露 k 值）
 */
function getAccessKid(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error("JWT_ACCESS_SECRET 未配置");
  }
  // 使用 SHA-256 生成稳定的 kid（不暴露原始密钥）
  return `access-token-v1`;
}

export async function GET(request: Request) {
  try {
    // 速率限制：JWKS 暴露签名密钥，按 IP 限制访问频率
    const ip = getClientIP(request);
    const limitResult = await rateLimit(ip, "oauth-jwks");
    if (!limitResult.success) {
      return NextResponse.json(
        { error: "rate_limited" },
        {
          status: 429,
          headers: { "Retry-After": "60" },
        }
      );
    }

    const now = Date.now();

    // 返回缓存
    if (cachedJWKS && now - cachedJWKS.timestamp < CACHE_TTL_MS) {
      return new NextResponse(cachedJWKS.body, {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        },
      });
    }

    const keys: Record<string, unknown>[] = [];

    // 若配置了 RS256 公钥，则公开给子项目本地验证
    const accessPublicKey = await getAccessPublicKey();
    if (accessPublicKey) {
      // export public key as JWK
      const jwk = await crypto.subtle.exportKey("jwk", accessPublicKey);
      keys.push({
        kty: jwk.kty,
        kid: "access-token-rs256-v1",
        alg: "RS256",
        use: "sig",
        n: jwk.n,
        e: jwk.e,
      });
    }

    // 若配置了 ID Token RS256 公钥，也公开给子项目验证 ID Token
    const idTokenPublicKey = await getIdTokenPublicKey();
    if (idTokenPublicKey) {
      const jwk = await crypto.subtle.exportKey("jwk", idTokenPublicKey);
      keys.push({
        kty: jwk.kty,
        kid: "id-token-rs256-v1",
        alg: "RS256",
        use: "sig",
        n: jwk.n,
        e: jwk.e,
      });
    }

    // 兼容期：仍保留 HS256 kid 占位，但不暴露 k 值
    keys.push({
      kty: "oct",
      kid: "access-token-v1",
      alg: "HS256",
      use: "sig",
      // ⚠️ k 值（对称签名密钥）不通过 JWKS 公开。
      // HS256 对称密钥无法安全分发，因此：
      // 1. 子项目应使用 Introspection 端点验证 token：POST /api/oauth/introspect
      // 2. 如需本地验证，配置 JWT_ACCESS_PUBLIC_KEY 启用 RS256
      // 详见本文件顶部注释中的迁移路线图
    });

    const jwks = { keys };

    const body = JSON.stringify(jwks);
    cachedJWKS = { body, timestamp: now };

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "server_error" },
      { status: 500 }
    );
  }
}
