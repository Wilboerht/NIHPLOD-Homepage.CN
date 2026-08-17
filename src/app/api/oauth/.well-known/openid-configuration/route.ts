/**
 * OpenID Connect Discovery 端点
 * GET /api/oauth/.well-known/openid-configuration
 *
 * 返回标准 OpenID Connect Discovery 文档（RFC 8414）。
 * SDK 初始化时自动 fetch 此端点获取完整配置。
 */
import { NextRequest, NextResponse } from "next/server";
import { SUPPORTED_SCOPES, getIssuer } from "@/lib/oauth-constants";
import { DPOP_SUPPORTED_ALGORITHMS } from "@/lib/dpop";
import { rateLimit, getClientIP } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/** 支持的 response_type */
const RESPONSE_TYPES = ["code"];

/** 支持的 grant_type — 必须与 token/route.ts 实际支持保持同步，新增 grant type 时同步更新此处 */
const GRANT_TYPES = ["authorization_code", "refresh_token", "client_credentials"];

/** 支持的 code_challenge_method */
const CODE_CHALLENGE_METHODS = ["S256"];

/** 支持的 token_endpoint_auth_method */
const TOKEN_ENDPOINT_AUTH_METHODS = ["client_secret_basic", "client_secret_post", "none"];

/**
 * 支持的 ID Token 签名算法。
 * 配置了 RS256 密钥时优先广播 RS256；生产环境默认不广播 HS256，
 * 仅在显式启用 ALLOW_HS256_FALLBACK（新旧密钥轮换过渡期）时保留。
 */
function getIdTokenSigningAlgValues(): string[] {
  const hasRs256 = !!process.env.JWT_ID_TOKEN_PUBLIC_KEY;
  if (!hasRs256) return ["HS256"];
  const allowHs256 =
    process.env.ALLOW_HS256_FALLBACK === "true" || process.env.NODE_ENV !== "production";
  return allowHs256 ? ["RS256", "HS256"] : ["RS256"];
}

export async function GET(request: NextRequest) {
  // 公开端点限流：可缓存但需防止流量放大
  const ip = getClientIP(request);
  const limitResult = await rateLimit(ip, "oauth-discovery");
  if (!limitResult.success) {
    return NextResponse.json(
      { error: "rate_limited", error_description: "请求过于频繁" },
      { status: 429 }
    );
  }

  // 发现文档的 issuer 必须稳定公开，优先使用环境变量中的公网地址，
  // 避免反向代理后 request.nextUrl.origin 变成 localhost:3000
  const origin = getIssuer();

  const discovery = {
    issuer: origin,
    authorization_endpoint: `${origin}/api/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    userinfo_endpoint: `${origin}/api/oauth/userinfo`,
    jwks_uri: `${origin}/api/oauth/jwks`,
    introspection_endpoint: `${origin}/api/oauth/introspect`,
    revocation_endpoint: `${origin}/api/oauth/revoke`,
    end_session_endpoint: `${origin}/api/oauth/end-session`,
    scopes_supported: SUPPORTED_SCOPES,
    response_types_supported: RESPONSE_TYPES,
    grant_types_supported: GRANT_TYPES,
    code_challenge_methods_supported: CODE_CHALLENGE_METHODS,
    id_token_signing_alg_values_supported: getIdTokenSigningAlgValues(),
    token_endpoint_auth_methods_supported: TOKEN_ENDPOINT_AUTH_METHODS,
    // RFC 9449：DPoP proof 支持的签名算法
    dpop_signing_alg_values_supported: DPOP_SUPPORTED_ALGORITHMS,
    subject_types_supported: ["public"],
    claims_supported: ["sub", "nickname", "avatar", "phone", "membership_level", "total_points"],
    claims_parameter_supported: false,
    request_parameter_supported: false,
    request_uri_parameter_supported: false,
    backchannel_logout_supported: true,
    backchannel_logout_session_supported: true,
    frontchannel_logout_supported: false,
    frontchannel_logout_session_supported: false,
    // 非标准扩展（主站无 /docs/sso-integration 页面路由，指向公开 API 文档端点）
    service_documentation: `${origin}/api/oauth/docs`,
  };

  return NextResponse.json(discovery, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
