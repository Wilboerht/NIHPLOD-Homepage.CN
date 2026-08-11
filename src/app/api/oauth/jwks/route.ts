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
import {
  getAccessPublicKey,
  getPrevAccessPublicKey,
  getAccessKeyId,
  getPrevAccessKeyId,
  getIdTokenPublicKey,
  getPrevIdTokenPublicKey,
  getIdTokenKeyId,
  getPrevIdTokenKeyId,
  getLogoutTokenPublicKey,
  getPrevLogoutTokenPublicKey,
  getLogoutTokenKeyId,
  getPrevLogoutTokenKeyId,
} from "@/lib/jwt";

export const dynamic = "force-dynamic";

// 内存缓存 JWKS 响应（1 小时 TTL）
let cachedJWKS: { body: string; timestamp: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 小时

export async function GET(request: Request) {
  try {
    // 速率限制：JWKS 暴露签名密钥，按 IP 限制访问频率
    const ip = getClientIP(request);
    const limitResult = await rateLimit(ip, "oauth-jwks");
    if (!limitResult.success) {
      return NextResponse.json(
        { error: "rate_limited", error_description: "请求过于频繁" },
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
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    const keys: Record<string, unknown>[] = [];

    // 同时暴露当前与上一代公钥（各自 kid）：密钥轮换过渡期内，
    // 子项目仍可验证上一代密钥签发的未过期 token。kid 可通过环境变量覆盖。
    const keyEntries: { getKey: () => Promise<CryptoKey | null>; kid: string }[] = [
      { getKey: getAccessPublicKey, kid: getAccessKeyId() },
      { getKey: getPrevAccessPublicKey, kid: getPrevAccessKeyId() },
      { getKey: getIdTokenPublicKey, kid: getIdTokenKeyId() },
      { getKey: getPrevIdTokenPublicKey, kid: getPrevIdTokenKeyId() },
      { getKey: getLogoutTokenPublicKey, kid: getLogoutTokenKeyId() },
      { getKey: getPrevLogoutTokenPublicKey, kid: getPrevLogoutTokenKeyId() },
    ];

    for (const { getKey, kid } of keyEntries) {
      const publicKey = await getKey();
      if (!publicKey) continue;
      // export public key as JWK
      const jwk = await crypto.subtle.exportKey("jwk", publicKey);
      keys.push({
        kty: jwk.kty,
        kid,
        alg: "RS256",
        use: "sig",
        n: jwk.n,
        e: jwk.e,
      });
    }

    const jwks = { keys };

    const body = JSON.stringify(jwks);
    cachedJWKS = { body, timestamp: now };

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "server_error", error_description: "服务器内部错误" },
      { status: 500 }
    );
  }
}
