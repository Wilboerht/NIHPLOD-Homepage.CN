import { permanentRedirect } from "next/navigation";

/**
 * 已迁移：SSO 审计日志已合并至 /admin/oauth/audit
 * 保留旧路由做 301 永久重定向，避免旧链接/书签失效
 */
export default function SsoAuditRedirectPage() {
  permanentRedirect("/admin/oauth/audit");
}
