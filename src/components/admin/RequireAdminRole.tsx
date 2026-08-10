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
import { ReactNode, useEffect, useState, useCallback } from "react";
import { apiGet } from "@/lib/api-client";
import { ShieldAlert, WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface RequireAdminRoleProps {
  role: "owner" | "admin";
  children: ReactNode;
}

export function RequireAdminRole({ role, children }: RequireAdminRoleProps) {
  const [userRole, setUserRole] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchRole = useCallback(() => {
    let cancelled = false;
    apiGet<{ user: { role: string } }>("/api/admin/me")
      .then((data) => {
        if (!cancelled) setUserRole(data.user?.role);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cleanup = fetchRole();
    return cleanup;
  }, [fetchRole]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <WifiOff className="h-12 w-12 text-brand-charcoal/30" />
        <p className="text-lg font-medium text-brand-charcoal/70">网络错误</p>
        <p className="text-sm text-brand-charcoal/50">无法验证管理员权限，请检查网络连接</p>
        <Button
          variant="outline"
          onClick={() => {
            // 重试时在事件回调中重置状态（避免 effect 内同步 setState）
            setLoading(true);
            setError(false);
            fetchRole();
          }}
          leftIcon={<RefreshCw className="h-4 w-4" />}
        >
          重试
        </Button>
      </div>
    );
  }

  if (!userRole || userRole !== role) {
    const roleLabel = role === "owner" ? "超级管理员" : "管理员";
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <ShieldAlert className="h-12 w-12 text-brand-charcoal/30" />
        <p className="text-lg font-medium text-brand-charcoal/70">无权访问</p>
        <p className="text-sm text-brand-charcoal/50">该页面仅限{roleLabel}访问</p>
      </div>
    );
  }

  return <>{children}</>;
}
