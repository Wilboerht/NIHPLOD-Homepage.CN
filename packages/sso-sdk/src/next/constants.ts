/**
 * Next.js 集成默认 Cookie 名称
 *
 * 统一使用 __Host- 前缀，要求：
 * - Secure
 * - Path=/
 * - 无 Domain 属性
 */

export const DEFAULT_ACCESS_TOKEN_COOKIE_NAME = "__Host-nihplod_sso_at";
export const DEFAULT_REFRESH_TOKEN_COOKIE_NAME = "__Host-nihplod_sso_rt";
export const DEFAULT_STATE_COOKIE_NAME = "__Host-nihplod_sso_state";
export const DEFAULT_RETURN_COOKIE_NAME = "__Host-nihplod_sso_return";
export const DEFAULT_VERIFIER_COOKIE_NAME = "__Host-nihplod_sso_verifier";

/** __Host- 前缀 Cookie 的安全选项 */
export function getHostCookieOptions(maxAge?: number): {
  httpOnly: true;
  secure: true;
  sameSite: "lax";
  path: "/";
  maxAge?: number;
} {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    ...(maxAge !== undefined ? { maxAge } : {}),
  };
}
