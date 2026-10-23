import { ADVISOR_URL } from "@/lib/diary-utils";

/**
 * 主站管理员 → 测肤子站后台的 SSO 深链。
 * returnTo 仅允许子站 /admin 路径，避免被用作开放重定向。
 */
export function buildAdvisorAdminLink(returnTo = "/admin"): string {
  const safe = returnTo.startsWith("/admin") ? returnTo : "/admin";
  return `${ADVISOR_URL}/api/admin/auth/sso/start?return_to=${encodeURIComponent(safe)}`;
}
