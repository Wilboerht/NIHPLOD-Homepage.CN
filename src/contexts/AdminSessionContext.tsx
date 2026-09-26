"use client";

/**
 * 管理员会话上下文
 *
 * 全后台只请求一次 /api/admin/me，供 layout、useAdminPermissions、RequirePermission 共用：
 * - 401 统一跳转登录页
 * - 请求失败暴露 error + refresh，避免静默吞错导致权限按钮消失
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { apiGet } from "@/lib/api-client";
import type { AdminPermission } from "@/lib/admin-permissions";

interface AdminMeResponse {
  user: { id: string; role: string; name: string; permissions?: string[] };
}

export interface AdminSessionValue {
  id?: string;
  role?: string;
  name?: string;
  permissions: Set<string>;
  loading: boolean;
  error: boolean;
  can: (permission: AdminPermission) => boolean;
  refresh: () => void;
}

const AdminSessionContext = createContext<AdminSessionValue | null>(null);

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [id, setId] = useState<string | undefined>(undefined);
  const [role, setRole] = useState<string | undefined>(undefined);
  const [name, setName] = useState<string | undefined>(undefined);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // 不在 effect 内同步 setState：初始 loading=true；刷新由 refresh() 在事件中置位
    apiGet<AdminMeResponse>("/api/admin/me")
      .then((data) => {
        if (cancelled) return;
        setId(data.user?.id);
        setRole(data.user?.role);
        setName(data.user?.name);
        setPermissions(new Set(data.user?.permissions ?? []));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const status = (err as { status?: number })?.status;
        if (status === 401) {
          // 管理员账号被删除/禁用或会话过期，统一回登录页
          router.push("/admin-login");
          return;
        }
        setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router, reloadKey]);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(false);
    setReloadKey((key) => key + 1);
  }, []);

  const can = useCallback(
    (permission: AdminPermission) => role === "owner" || permissions.has(permission),
    [role, permissions]
  );

  const value = useMemo<AdminSessionValue>(
    () => ({ id, role, name, permissions, loading, error, can, refresh }),
    [id, role, name, permissions, loading, error, can, refresh]
  );

  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>;
}

export function useAdminSession(): AdminSessionValue {
  const context = useContext(AdminSessionContext);
  if (!context) {
    throw new Error("useAdminSession 必须在 AdminSessionProvider 内使用");
  }
  return context;
}
