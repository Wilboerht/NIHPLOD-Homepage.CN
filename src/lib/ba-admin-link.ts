const BA_URL = (process.env.NEXT_PUBLIC_BA_URL || "https://ba.nihplod.cn").replace(/\/+$/, "");

/**
 * 主站管理员 → BA 工作台 SSO 深链。
 * returnTo 仅允许 /workbench 路径，避免被用作开放重定向。
 */
export function buildBaAdminLink(returnTo = "/workbench"): string {
  const safe = returnTo.startsWith("/workbench") ? returnTo : "/workbench";
  return `${BA_URL}/api/admin/auth/sso/start?return_to=${encodeURIComponent(safe)}`;
}
