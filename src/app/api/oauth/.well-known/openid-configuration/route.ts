/**
 * OpenID Connect Discovery 端点
 * GET /api/oauth/.well-known/openid-configuration
 *
 * 返回标准 OpenID Connect Discovery 文档（RFC 8414）。
 * SDK 初始化时自动 fetch 此端点获取完整配置。
 */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** 支持的作用域 */
const SUPPORTED_SCOPES = ["openid", "profile", "phone", "membership"];

/** 支持的 response_type */
const RESPONSE_TYPES = ["code"];

/** 支持的 grant_type */
const GRANT_TYPES = ["authorization_code", "refresh_token"];

/** 支持的 code_challenge_method */
const CODE_CHALLENGE_METHODS = ["S256"];

/** 支持的 ID Token 签名算法（当前 HS256，后续迁移到 RS256） */
const ID_TOKEN_SIGNING_ALG_VALUES = ["HS256"];

/** 支持的 token_endpoint_auth_method */
const TOKEN_ENDPOINT_AUTH_METHODS = ["client_secret_post", "none"];

export async function GET(request: NextRequest) {
  // 构建 issuer (base URL)
  const { origin } = request.nextUrl;

  const discovery = {
    issuer: origin,
    authorization_endpoint: `${origin}/api/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    userinfo_endpoint: `${origin}/api/oauth/userinfo`,
    jwks_uri: `${origin}/api/oauth/jwks`,
    introspection_endpoint: `${origin}/api/oauth/introspect`,
    revocation_endpoint: `${origin}/api/oauth/revoke`,
    end_session_endpoint: `${origin}/logout`,
    scopes_supported: SUPPORTED_SCOPES,
    response_types_supported: RESPONSE_TYPES,
    grant_types_supported: GRANT_TYPES,
    code_challenge_methods_supported: CODE_CHALLENGE_METHODS,
    id_token_signing_alg_values_supported: ID_TOKEN_SIGNING_ALG_VALUES,
    token_endpoint_auth_methods_supported: TOKEN_ENDPOINT_AUTH_METHODS,
    subject_types_supported: ["public"],
    claims_supported: [
      "sub",
      "nickname",
      "avatar",
      "phone",
      "membership_level",
      "total_points",
    ],
    claims_parameter_supported: false,
    request_parameter_supported: false,
    request_uri_parameter_supported: false,
    // 非标准扩展
    service_documentation: `${origin}/docs/sso-integration`,
  };

  return NextResponse.json(discovery, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
