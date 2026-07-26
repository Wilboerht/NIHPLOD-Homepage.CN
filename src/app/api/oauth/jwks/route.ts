/**
 * JWKS (JSON Web Key Set) 端点
 * GET /api/oauth/jwks.json
 *
 * ⚠️ 安全警告：当前使用 HS256 对称密钥，kty="oct" 暴露共享密钥。
 * 任何能访问此端点的实体均可获取完整的签名密钥值，这意味着：
 *   1. 恶意第三方可伪造任意用户的 Access Token
 *   2. 密钥泄漏后无法单独吊销某个消费者的验证权限
 *
 * 🔜 迁移计划：升级至 RS256 非对称密钥，此端点仅暴露公钥。
 *   过渡期同时支持 HS256 和 RS256，通过 kid 区分。
 *
 * 当前缓解措施：
 *   - 响应缓存 1 小时减少暴露面
 *   - 生产环境通过反向代理限制访问来源 IP（建议实施）
 *   - HS256 密钥定期轮换（通过环境变量更新）
 */
import { NextResponse } from "next/server";
import { rateLimit, getClientIP } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

// 缓存 JWKS 响应（1 小时 TTL）
let cachedJWKS: { body: string; timestamp: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 小时

function getAccessSecretBase64Url(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error("JWT_ACCESS_SECRET 未配置");
  }
  // base64url 编码
  return Buffer.from(secret).toString("base64url");
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
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    const k = getAccessSecretBase64Url();

    const jwks = {
      keys: [
        {
          kty: "oct",
          kid: "access-token-v1",
          alg: "HS256",
          k,
        },
      ],
    };

    const body = JSON.stringify(jwks);
    cachedJWKS = { body, timestamp: now };

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "server_error" },
      { status: 500 }
    );
  }
}
