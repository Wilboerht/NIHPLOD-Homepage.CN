"use client";

/**
 * 当前管理员权限 hook
 *
 * 数据来自 AdminSessionProvider（全局单次 /api/admin/me），用于导航与操作按钮渲染。
 * 服务端为最终权威，前端仅做展示层收敛。
 */
import { useAdminSession } from "@/contexts/AdminSessionContext";

export function useAdminPermissions() {
  const { id, role, permissions, can, loading, error, refresh } = useAdminSession();
  return { id, role, permissions, can, loading, error, refresh };
}
