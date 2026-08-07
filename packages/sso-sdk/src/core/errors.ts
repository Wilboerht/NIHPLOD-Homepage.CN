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

/** 将 OAuth 2.0 服务端 error 字段映射到 SsoErrorCode */
export function mapOAuthErrorToSsoCode(oauthError: string): SsoErrorCode {
  switch (oauthError) {
    case "invalid_grant":
      return "authorization_code_expired";
    case "invalid_client":
      return "client_disabled";
    case "access_denied":
      return "user_denied_authorization";
    case "server_error":
      return "sso_server_error";
    case "rate_limited":
      return "network_error";
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
