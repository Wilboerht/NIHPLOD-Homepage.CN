/**
 * OpenID Connect Discovery 端点（标准 OIDC Discovery 路径）
 * GET /.well-known/openid-configuration
 *
 * 第三方 OIDC 库按 issuer 根路径发现配置时会请求此端点。
 * 内容与 /api/oauth/.well-known/openid-configuration 完全一致（共用 buildOpenIdConfiguration），
 * 历史路径继续保留以兼容自家 SDK 硬编码地址。
 *
 * 注意：middleware.ts 中 isApiPath 已将 "/.well-known/" 视为 API 路径，
 * 不会被 CSP nonce 注入或后台认证逻辑拦截，无需额外 matcher 配置。
 */
import { NextRequest, NextResponse } from "next/server";
import { buildOpenIdConfiguration } from "@/lib/oidc-discovery";
import { rateLimit, getClientIP } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // 公开端点限流：与历史路径使用同一限流桶，防止流量放大
  const ip = getClientIP(request);
  const limitResult = await rateLimit(ip, "oauth-discovery");
  if (!limitResult.success) {
    return NextResponse.json(
      { error: "rate_limited", error_description: "请求过于频繁" },
      { status: 429 }
    );
  }

  return NextResponse.json(buildOpenIdConfiguration(), {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
