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
  | "sso_server_error"
  | "network_error";

/** OAuth 2.0 标准错误码 */
export type OAuthErrorCode =
  | "invalid_request"
  | "invalid_client"
  | "invalid_grant"
  | "unauthorized_client"
  | "unsupported_grant_type"
  | "invalid_scope"
  | "access_denied"
  | "server_error"
  | "rate_limited";

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
 * OAuth 2.0 服务端返回的错误
 */
export class OAuthError extends Error {
  public readonly code: OAuthErrorCode;
  public readonly description: string;
  public readonly uri?: string;

  constructor(
    code: OAuthErrorCode,
    description: string,
    uri?: string
  ) {
    super(`[OAuth] ${code}: ${description}`);
    this.name = "OAuthError";
    this.code = code;
    this.description = description;
    this.uri = uri;
  }
}
