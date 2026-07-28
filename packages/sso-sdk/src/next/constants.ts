/**
 * Next.js 集成默认 Cookie 名称
 *
 * 除 verifier 外统一使用 __Host- 前缀，要求：
 * - Secure
 * - Path=/
 * - 无 Domain 属性
 *
 * verifier 需要写入回调路径（非 /），因此使用 __Secure- 前缀。
 */

export const DEFAULT_ACCESS_TOKEN_COOKIE_NAME = "__Host-nihplod_sso_at";
export const DEFAULT_REFRESH_TOKEN_COOKIE_NAME = "__Host-nihplod_sso_rt";
export const DEFAULT_ID_TOKEN_COOKIE_NAME = "__Host-nihplod_sso_id";
export const DEFAULT_STATE_COOKIE_NAME = "__Host-nihplod_sso_state";
export const DEFAULT_RETURN_COOKIE_NAME = "__Host-nihplod_sso_return";
// Verifier 需要写入回调路径（非 /），因此使用 __Secure- 前缀而非 __Host-
export const DEFAULT_VERIFIER_COOKIE_NAME = "__Secure-nihplod_sso_verifier";

/** __Host- 前缀 Cookie 的安全选项（Path 必须为 /） */
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

/** __Secure- 前缀 Cookie 的安全选项（允许自定义 Path） */
export function getSecureCookieOptions(
  maxAge?: number,
  path = "/"
): {
  httpOnly: true;
  secure: true;
  sameSite: "lax";
  path: string;
  maxAge?: number;
} {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path,
    ...(maxAge !== undefined ? { maxAge } : {}),
  };
}
