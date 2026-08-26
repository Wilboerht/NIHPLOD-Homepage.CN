/**
 * OAuth 2.0 / OIDC 共享常量
 *
 * 集中管理避免硬编码字符串散布各处导致的逻辑不一致。
 */

/** 系统支持的全部 scope */
export const SUPPORTED_SCOPES: readonly string[] = [
  "openid",
  "profile",
  "phone",
  "membership",
  "birthday",
];

/**
 * OIDC 隐式 scope：OIDC 核心定义这些 scope 对所有 client 默认允许，
 * 无需在 OAuthClient.scopes 中显式配置，也不要求用户 consent 中已存在。
 * 仅含 openid（如未来新增离线访问等 scope 则在此扩展）。
 */
export const OIDC_IMPLICIT_SCOPES: readonly string[] = ["openid"] as const;

/**
 * OpenID Connect issuer / 公开 base URL。
 * 全站唯一出处：JWT 签发/验证（jwt.ts）、Discovery 文档、授权重定向 iss 参数
 * 等所有 issuer 相关场景统一使用此函数，避免多处回退链不一致。
 * 回退链：NEXT_PUBLIC_APP_URL → NEXT_PUBLIC_BASE_URL → VERCEL_URL → localhost
 * （生产环境必须由 jwt.ts 的启动校验保证 NEXT_PUBLIC_APP_URL 为公网地址）
 */
export function getIssuer(): string {
  const publicUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL;
  if (publicUrl) return publicUrl.replace(/\/$/, "");
  return process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
}
