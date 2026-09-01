/**
 * JWKS (JSON Web Key Set) 端点
 * GET /api/oauth/jwks
 *
 * 发布 RS256 公钥（access token / ID token / logout token 三类），
 * 供子项目本地验签。密钥轮换过渡期同时暴露当前与上一代公钥（各自 kid），
 * 验证侧按 kid 匹配。
 *
 * 响应内存缓存 1 小时（ stale-while-revalidate 1 天），CORS 开放 *（公钥本就公开）。
 * 对称密钥（HS256 secret）永不在此暴露。
 */
import { NextResponse } from "next/server";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { apiConsole } from "@/lib/logger";
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
  } catch (error) {
    // 不静默吞错：公钥 PEM 损坏（如环境变量换行符转义问题）等配置错误
    // 只会在请求时触发，日志是定位此类问题的唯一线索（响应体不含内部细节）
    apiConsole.error("[OAuth JWKS] 异常:", error);
    return NextResponse.json(
      { error: "server_error", error_description: "服务器内部错误" },
      { status: 500 }
    );
  }
}
