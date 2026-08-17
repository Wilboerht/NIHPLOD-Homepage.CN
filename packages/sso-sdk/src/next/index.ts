/**
 * @nihplod/sso-sdk/next
 *
 * Next.js App Router 绑定：
 * - createSsoMiddleware: Next.js Middleware 辅助函数
 * - createCallbackRouteHandler: App Router 回调 Route Handler
 * - createLogoutRouteHandler: App Router 登出 Route Handler
 */

export { createSsoMiddleware } from "./middleware";
export type { SsoMiddlewareConfig } from "./middleware";

export { createCallbackRouteHandler } from "./callback";
export type { CallbackRouteConfig } from "./callback";

export { createLogoutRouteHandler } from "./logout";
export type { LogoutRouteConfig } from "./logout";

export {
  DEFAULT_ACCESS_TOKEN_COOKIE_NAME,
  DEFAULT_REFRESH_TOKEN_COOKIE_NAME,
  DEFAULT_ID_TOKEN_COOKIE_NAME,
  DEFAULT_STATE_COOKIE_NAME,
  DEFAULT_RETURN_COOKIE_NAME,
  DEFAULT_VERIFIER_COOKIE_NAME,
  DEFAULT_LOGOUT_STATE_COOKIE_NAME,
  getHostCookieOptions,
  getSecureCookieOptions,
  toInsecureCookieName,
} from "./constants";
