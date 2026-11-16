"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ViewTransitions } from "next-view-transitions";

function isAdminPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/admin-login" ||
    pathname.startsWith("/admin-login/")
  );
}

/**
 * View Transitions 仅用于官网页面。
 *
 * 管理端是 SPA 式操作界面，且大量抽屉通过 query 参数控制。
 * 全局 ViewTransitions 会在浏览器 back/forward（popstate）时对整页做快照和交叉淡入淡出，
 * 导致抽屉关闭出现整页转场叠加、卡顿甚至过渡挂起。
 */
export function ViewTransitionsGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isAdminPath(pathname)) return <>{children}</>;
  return <ViewTransitions>{children}</ViewTransitions>;
}
