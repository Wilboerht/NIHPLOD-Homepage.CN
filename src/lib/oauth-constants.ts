/**
 * OAuth 2.0 / OIDC 共享常量
 *
 * 集中管理避免硬编码字符串散布各处导致的逻辑不一致。
 */

/** 系统支持的全部 scope */
export const SUPPORTED_SCOPES: readonly string[] = ["openid", "profile", "phone", "membership"];

/**
 * OIDC 隐式 scope：OIDC 核心定义这些 scope 对所有 client 默认允许，
 * 无需在 OAuthClient.scopes 中显式配置，也不要求用户 consent 中已存在。
 * 仅含 openid（如未来新增离线访问等 scope 则在此扩展）。
 */
export const OIDC_IMPLICIT_SCOPES: readonly string[] = ["openid"] as const;
