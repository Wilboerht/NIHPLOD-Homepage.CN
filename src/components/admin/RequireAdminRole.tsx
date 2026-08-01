"use client";

/**
 * 管理员角色门禁组件
 *
 * 用于 owner 专属页面：admin 角色直接输入 URL 访问时，
 * 显示"无权限"提示而不是渲染页面空壳（API 层已拦截，这里是 UI 层兜底）。
 *
 * @example
 * ```tsx
 * export default function OAuthClientsPage() {
 *   return (
 *     <RequireAdminRole role="owner">
 *       <OAuthClientsContent />
 *     </RequireAdminRole>
 *   );
 * }
 * ```
 */
import { ReactNode, useEffect, useState } from "react";
import { apiGet } from "@/lib/api-client";
import { ShieldAlert } from "lucide-react";

interface RequireAdminRoleProps {
  role: "owner" | "admin";
  children: ReactNode;
}

export function RequireAdminRole({ role, children }: RequireAdminRoleProps) {
  const [userRole, setUserRole] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiGet<{ user: { role: string } }>("/api/admin/me")
      .then((data) => {
        if (!cancelled) setUserRole(data.user?.role);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
      </div>
    );
  }

  if (!userRole || userRole !== role) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <ShieldAlert className="h-12 w-12 text-brand-charcoal/30" />
        <p className="text-lg font-medium text-brand-charcoal/70">无权访问</p>
        <p className="text-sm text-brand-charcoal/50">该页面仅限超级管理员访问</p>
      </div>
    );
  }

  return <>{children}</>;
}
