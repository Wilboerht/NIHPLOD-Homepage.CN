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
  "profile:write",
  // 高危写能力独立 scope：避免只申请“改资料”的第三方 client 获得
  // 撤销其他应用授权 / 强制下线 / 解绑身份 / 注销账号 / 改密 / 换绑手机号等能力。
  "security:manage",
  "phone:write",
  "account:delete",
  "password:write",
];

/**
 * OIDC 隐式 scope：OIDC 核心定义这些 scope 对所有 client 默认允许，
 * 无需在 OAuthClient.scopes 中显式配置，也不要求用户 consent 中已存在。
 * 仅含 openid（如未来新增离线访问等 scope 则在此扩展）。
 */
export const OIDC_IMPLICIT_SCOPES: readonly string[] = ["openid"] as const;

/**
 * 敏感 OAuth 资源（收货地址、兑换 PII）的第一方/显式允许客户端。
 * membership scope 只代表会员等级读取，不再隐式授予地址写/兑换 PII 读取。
 */
export function isOAuthClientAllowed(
  envName: string,
  clientId: string | null | undefined,
  defaults: readonly string[] = []
): boolean {
  if (!clientId) return false;
  const raw = process.env[envName]?.trim();
  const allowed = new Set(
    (raw ? raw.split(",") : defaults).map((value) => value.trim()).filter(Boolean)
  );
  return allowed.has(clientId);
}

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
