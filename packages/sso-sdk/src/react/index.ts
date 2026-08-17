/**
 * @nihplod/sso-sdk/react
 *
 * React 绑定层：SsoProvider Context、useSso Hook、RequireAuth 路由保护、CallbackPage 回调处理。
 */

export { SsoProvider, useSso } from "./SsoProvider";
export { RequireAuth, withAuth } from "./RequireAuth";
export { CallbackPage, DefaultCallbackError } from "./CallbackPage";
export type { CallbackPageProps } from "./CallbackPage";
