/**
 * @nihplod/sso-sdk
 *
 * NIHPLOD 一网通 SSO Node.js SDK
 *
 * 提供完整的 OAuth 2.0 客户端功能，供子项目后端集成 SSO。
 *
 * 安装：npm install @nihplod/sso-sdk
 *
 * 使用：
 * ```typescript
 * import { OAuth2Client } from "@nihplod/sso-sdk";
 *
 * const sso = new OAuth2Client({
 *   clientId: "advisor",
 *   clientSecret: "your-secret",
 *   redirectUri: "https://advisor.nihplod.cn/callback",
 *   providerUrl: "https://nihplod.cn",
 * });
 *
 * // 步骤 1: 生成授权 URL
 * const { url, codeVerifier, state } = sso.getAuthorizationUrl({
 *   scope: "openid profile phone",
 * });
 *
 * // 步骤 2: 处理回调
 * const tokens = await sso.handleCallback({ code, codeVerifier, expectedState: state });
 *
 * // 步骤 3: 获取用户信息
 * const user = await sso.getUserInfo();
 *
 * // 步骤 4: 登出
 * await sso.logout();
 * ```
 */

// Core
export { OAuth2Client } from "./client";
export type {
  OAuth2ClientConfig,
  AuthorizationUrlParams,
  AuthorizationUrlResult,
  CallbackParams,
  TokenResponse,
  UserInfo,
} from "./client";

// Token Store
export {
  InMemoryTokenStore,
  FileTokenStore,
  RefreshMutex,
  AutoRefreshManager,
} from "./token-store";
export type { TokenData, TokenStore, AutoRefreshOptions } from "./token-store";

// Events
export { SsoEventEmitter } from "./events";
export type { SsoSdkEvents } from "./events";

// Degradation
export { DegradationManager } from "./degradation";
export type { DegradationCacheEntry, DegradationOptions } from "./degradation";
