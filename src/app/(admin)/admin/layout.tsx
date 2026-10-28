import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentAdmin } from "@/lib/auth";
import { AdminAccessDenied } from "@/components/admin/AdminAccessDenied";
import {
  ADMIN_PAGE_PATH_HEADER,
  canAccessAdminPage,
  getAdminPageRule,
  getAdminPageRulePermissions,
} from "@/lib/admin-page-permissions";

export const dynamic = "force-dynamic";

/**
 * 管理端页面服务端门禁。
 * middleware/proxy 只验证 JWT 签名/过期，无法感知管理员被禁用、删除、改角色、
 * 改权限或 tokenVersion 变化；这里在渲染任何 /admin/* 页面前做一次数据库校验。
 * 同时按 proxy 注入的真实 pathname 校验页面级权限，避免只依赖客户端 RequirePermission。
 * `/admin-login` 不在 /admin 路径下，不会进入本布局，避免登录页被自身重定向。
 */
export default async function AdminServerLayout({ children }: { children: ReactNode }) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    // reauth=1 让 proxy 放行登录页；否则 JWT 签名仍有效但 DB 校验失败时
    //（改密/改角色/禁用/删除/tokenVersion 变化）会在 /admin 与登录页之间死循环。
    redirect("/admin-login?reauth=1");
  }

  const pathname = (await headers()).get(ADMIN_PAGE_PATH_HEADER);
  if (!pathname) {
    // 正常情况下 proxy 会为所有已登录 /admin 请求注入该头；缺失时 fail-closed。
    return <AdminAccessDenied description="无法校验页面权限，请刷新页面重试" />;
  }

  const rule = getAdminPageRule(pathname);
  if (!rule || !canAccessAdminPage(admin, pathname)) {
    return (
      <AdminAccessDenied
        permissions={rule ? getAdminPageRulePermissions(rule) : []}
        mode={rule?.allOf ? "all" : "any"}
      />
    );
  }

  return children;
}
