import { permanentRedirect } from "next/navigation";

interface SsoAuditRedirectPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * 已迁移：SSO 审计日志已合并至 /admin/oauth/audit
 * 保留旧路由做 301 永久重定向，并转发筛选参数，避免旧链接/书签失效
 */
export default async function SsoAuditRedirectPage({ searchParams }: SsoAuditRedirectPageProps) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      qs.set(key, value);
    } else if (Array.isArray(value)) {
      value.forEach((v) => qs.append(key, v));
    }
  }
  const query = qs.toString();
  permanentRedirect(`/admin/oauth/audit${query ? `?${query}` : ""}`);
}
