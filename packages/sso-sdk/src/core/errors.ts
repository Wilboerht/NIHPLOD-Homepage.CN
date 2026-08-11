/**
 * SSO SDK 错误类型
 */

/** SSO 错误码 */
export type SsoErrorCode =
  | "invalid_config"
  | "state_mismatch"
  | "pkce_required"
  | "token_request_failed"
  | "session_expired"
  | "no_refresh_token"
  | "userinfo_failed"
  | "not_authenticated"
  | "authorization_code_expired"
  | "authorization_code_used"
  | "client_disabled"
  | "user_denied_authorization"
  | "account_disabled"
  | "sso_server_error"
  | "rate_limited"
  | "network_error"
  | "popup_blocked"
  | "popup_closed"
  | "id_token_invalid"
  | "id_token_unsupported_alg"
  | "id_token_hs256_unsupported"
  | "id_token_missing_secret"
  | "id_token_invalid_signature"
  | "id_token_issuer_mismatch"
  | "id_token_audience_mismatch"
  | "id_token_expired"
  | "id_token_missing_sub"
  | "id_token_at_hash_mismatch";

/**
 * 将 OAuth 2.0 服务端 error 字段映射到 SsoErrorCode
 *
 * @param oauthError 服务端返回的 error 字段
 * @param context 调用上下文："token_exchange"（授权码换 token）或 "refresh"（刷新）。
 *   invalid_grant 在换 token 场景多为授权码过期/已用，在刷新场景多为会话失效，
 *   需按上下文细化映射。
 */
export function mapOAuthErrorToSsoCode(
  oauthError: string,
  context: "token_exchange" | "refresh" = "token_exchange"
): SsoErrorCode {
  switch (oauthError) {
    case "invalid_grant":
      // 刷新场景的 invalid_grant 表示 refresh_token 已撤销/过期（调用方另会清除本地登录态）
      return context === "refresh" ? "session_expired" : "authorization_code_expired";
    case "invalid_client":
      return "client_disabled";
    case "access_denied":
      return "user_denied_authorization";
    case "server_error":
      return "sso_server_error";
    case "rate_limited":
      // 限流是独立的可重试错误，不应误报为 network_error
      return "rate_limited";
    case "invalid_scope":
    case "invalid_request":
    case "unauthorized_client":
    case "unsupported_grant_type":
    default:
      return "token_request_failed";
  }
}

/**
 * SSO SDK 自定义错误
 */
export class SsoError extends Error {
  public readonly code: SsoErrorCode;
  public readonly description: string;
  public readonly cause?: unknown;

  constructor(code: SsoErrorCode, description: string, cause?: unknown) {
    super(`[SSO SDK] ${code}: ${description}`);
    this.name = "SsoError";
    this.code = code;
    this.description = description;
    this.cause = cause;
  }
}

/**
 * OAuth 2.0 协议层错误（RFC 6749 §5.2）
 *
 * 用于表示服务端原样返回的 OAuth 错误（error / error_description / error_uri），
 * 与 SDK 语义的 SsoError 区分。
 */
export class OAuthError extends Error {
  public readonly code: string;
  public readonly description: string;
  public readonly uri?: string;

  constructor(code: string, description: string, uri?: string) {
    super(`[OAuth] ${code}: ${description}`);
    this.name = "OAuthError";
    this.code = code;
    this.description = description;
    this.uri = uri;
  }
}
