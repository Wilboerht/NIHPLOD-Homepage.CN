import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * 管理端页面服务端门禁：
 * middleware 只验证 JWT 签名/过期，无法感知管理员被禁用、删除、改角色或 tokenVersion 变化。
 * 这里在渲染任何 /admin/* 页面前做一次数据库校验，未通过则整页跳转登录。
 * `/admin-login` 不在 /admin 路径下，不会进入本布局，避免登录页被自身重定向。
 */
export default async function AdminServerLayout({ children }: { children: ReactNode }) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect("/admin-login?reason=session_expired");
  }

  return children;
}
