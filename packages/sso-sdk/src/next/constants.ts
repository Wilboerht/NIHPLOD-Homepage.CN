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
// RP-Initiated Logout 的 state cookie（登出 CSRF 防护）
export const DEFAULT_LOGOUT_STATE_COOKIE_NAME = "__Host-nihplod_sso_logout_state";

/**
 * insecureLocalDev 场景：去除 __Host-/__Secure- 前缀。
 * 浏览器强制要求带这两个前缀的 Cookie 必须设置 Secure，
 * HTTP 本地开发时若保留前缀，即使 secure=false 也会被拒绝写入。
 */
export function toInsecureCookieName(name: string): string {
  return name.replace(/^__(Host|Secure)-/, "");
}

/**
 * 解析 insecureLocalDev 开关并输出告警（middleware / callback / logout 三处共用，保证行为一致）。
 *
 * 生产守卫：当 NODE_ENV=production 且 ssoBaseUrl 为 https 时强制忽略该开关，
 * Cookie 仍使用 Secure 属性并保留 __Host-/__Secure- 前缀，
 * 避免误配置把生产环境的 Cookie 降级为 HTTP 可写。
 *
 * 返回值为实际生效的 insecureLocalDev 状态。
 */
export function resolveInsecureLocalDev(enabled: boolean, ssoBaseUrl: string): boolean {
  if (!enabled) return false;
  if (process.env.NODE_ENV === "production" && /^https:\/\//i.test(ssoBaseUrl)) {
    console.warn(
      "[SSO SDK] insecureLocalDev=true 已被忽略：当前为生产环境（NODE_ENV=production）且 ssoBaseUrl 使用 HTTPS，" +
      "Cookie 仍保持 Secure 属性与 __Host-/__Secure- 前缀。请从生产配置中移除该开关。"
    );
    return false;
  }
  console.warn(
    "[SSO SDK] insecureLocalDev=true：Cookie 的 Secure 属性已关闭且去除 __Host-/__Secure- 前缀。" +
    "仅限 http://localhost 本地开发使用，生产环境必须移除该配置（生产必须用 HTTPS）。"
  );
  return true;
}

/** __Host- 前缀 Cookie 的安全选项（Path 必须为 /） */
export function getHostCookieOptions(
  maxAge?: number,
  secure: boolean = true
): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge?: number;
} {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    ...(maxAge !== undefined ? { maxAge } : {}),
  };
}

/** __Secure- 前缀 Cookie 的安全选项（允许自定义 Path） */
export function getSecureCookieOptions(
  maxAge?: number,
  path = "/",
  secure: boolean = true
): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge?: number;
} {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path,
    ...(maxAge !== undefined ? { maxAge } : {}),
  };
}
