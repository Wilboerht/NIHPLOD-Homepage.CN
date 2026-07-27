/**
 * @nihplod/sso-sdk/next
 *
 * Next.js App Router 绑定：
 * - createSsoMiddleware: Next.js Middleware 辅助函数
 * - SsoCallbackRoute: App Router 回调 Route Handler
 */

export { createSsoMiddleware } from "./middleware";
export type { SsoMiddlewareConfig } from "./middleware";

export { createCallbackRouteHandler } from "./callback";
