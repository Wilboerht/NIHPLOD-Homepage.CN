/**
 * @nihplod/sso-sdk 核心入口
 *
 * 导出 SsoClient、PKCE 工具、存储层和错误类。
 * 无框架依赖，可在任何 JavaScript/TypeScript 项目中使用。
 */

export { SsoClient } from "./core/SsoClient";
export type { SsoClientConfig, SsoUser, TokenResponse, OidcDiscovery } from "./core/SsoClient";

export {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
} from "./core/pkce";

export {
  setTokenStorage,
  getTokenStorage,
  createSecureStorage,
  saveTokenData,
  getTokenData,
  removeTokenData,
  savePkceVerifier,
  getPkceVerifier,
  removePkceVerifier,
  saveOAuthState,
  getOAuthState,
  removeOAuthState,
  saveLogoutState,
  getLogoutState,
  removeLogoutState,
  saveReturnUrl,
  getReturnUrl,
  removeReturnUrl,
  clearAllSsoData,
  clearVerifiersForClients,
} from "./core/storage";
export type { TokenData, TokenStorage } from "./core/storage";

export { SsoError, OAuthError, mapOAuthErrorToSsoCode } from "./core/errors";
export type { SsoErrorCode } from "./core/errors";

export { isTrustedReturnUrl, timingSafeEqualString } from "./core/security";
