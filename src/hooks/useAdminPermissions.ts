"use client";

/**
 * 当前管理员权限 hook
 * 从 /api/admin/me 读取解析后的有效权限（含个人覆盖），用于导航与操作按钮渲染。
 * 服务端为最终权威，前端仅做展示层收敛。
 */
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api-client";
import type { AdminPermission } from "@/lib/admin-permissions";

interface AdminMeResponse {
  user: { id: string; role: string; permissions?: string[] };
}

export function useAdminPermissions() {
  const [id, setId] = useState<string | undefined>(undefined);
  const [role, setRole] = useState<string | undefined>(undefined);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiGet<AdminMeResponse>("/api/admin/me")
      .then((data) => {
        if (cancelled) return;
        setId(data.user?.id);
        setRole(data.user?.role);
        setPermissions(new Set(data.user?.permissions ?? []));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const can = (permission: AdminPermission) => role === "owner" || permissions.has(permission);

  return { id, role, permissions, can, loading };
}
