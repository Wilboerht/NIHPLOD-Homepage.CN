/**
 * OpenID Connect Discovery 文档构建（RFC 8414 / OIDC Discovery 1.0）
 *
 * 共享模块：同时服务于两个 Discovery 入口，保证内容完全一致：
 * - GET /api/oauth/.well-known/openid-configuration（历史路径，自家 SDK 硬编码使用，保留兼容）
 * - GET /.well-known/openid-configuration（标准 OIDC Discovery 路径，供第三方 OIDC 库按 issuer 发现）
 */
import { SUPPORTED_SCOPES, getIssuer } from "@/lib/oauth-constants";
import { DPOP_SUPPORTED_ALGORITHMS } from "@/lib/dpop";

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

/**
 * 构建 OpenID Connect Discovery 文档。
 *
 * issuer 必须稳定公开，优先使用环境变量中的公网地址（getIssuer），
 * 避免反向代理后 request.nextUrl.origin 变成 localhost:3000。
 * 注意：issuer 不含 /api/oauth 前缀（与 JWT 签发侧一致），
 * 各端点 URL 仍指向 /api/oauth/... —— 端点位置与发现入口无关。
 */
export function buildOpenIdConfiguration() {
  const origin = getIssuer();

  return {
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
    claims_supported: [
      "sub",
      "nickname",
      "avatar",
      // phone 为历史非标准 claim 名（兼容保留），phone_number 为 OIDC 标准 claim
      "phone",
      "phone_number",
      "birthday",
      "membership_level",
    ],
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
}
