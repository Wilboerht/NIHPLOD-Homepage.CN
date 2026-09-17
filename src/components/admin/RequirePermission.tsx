"use client";

/**
 * 管理员权限门禁组件
 *
 * 用于需要特定权限点的页面：无权限的管理员即使直接输入 URL，
 * 也显示"无权限"提示而不是渲染页面空壳（API 层已拦截，这里是 UI 层兜底）。
 *
 * @example
 * ```tsx
 * export default function OAuthClientsPage() {
 *   return (
 *     <RequirePermission permission="sso:clients:read">
 *       <OAuthClientsContent />
 *     </RequirePermission>
 *   );
 * }
 * ```
 */
import { ReactNode, useEffect, useState, useCallback } from "react";
import { apiGet } from "@/lib/api-client";
import { ShieldAlert, WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PERMISSION_LABELS, type AdminPermission } from "@/lib/admin-permissions";

interface RequirePermissionProps {
  permission: AdminPermission;
  children: ReactNode;
}

export function RequirePermission({ permission, children }: RequirePermissionProps) {
  const [allowed, setAllowed] = useState<boolean | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchPermissions = useCallback(() => {
    let cancelled = false;
    apiGet<{ user: { role: string; permissions?: string[] } }>("/api/admin/me")
      .then((data) => {
        if (cancelled) return;
        const isOwner = data.user?.role === "owner";
        setAllowed(isOwner || (data.user?.permissions ?? []).includes(permission));
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
  }, [permission]);

  useEffect(() => {
    const cleanup = fetchPermissions();
    return cleanup;
  }, [fetchPermissions]);

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
            setLoading(true);
            setError(false);
            fetchPermissions();
          }}
          leftIcon={<RefreshCw className="h-4 w-4" />}
        >
          重试
        </Button>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <ShieldAlert className="h-12 w-12 text-brand-charcoal/30" />
        <p className="text-lg font-medium text-brand-charcoal/70">无权访问</p>
        <p className="text-sm text-brand-charcoal/50">
          该页面需要「{PERMISSION_LABELS[permission]}」权限，请联系超级管理员开通
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
