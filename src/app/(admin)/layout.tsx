"use client";

import { ReactNode, Suspense } from "react";
import { usePathname } from "next/navigation";
import { AdminShell } from "@/components/admin";
import { ToastProvider } from "@/components/ui/Toast";
import { AdminSessionProvider } from "@/contexts/AdminSessionContext";

interface AdminLayoutProps {
  children: ReactNode;
}

/**
 * 后台管理布局
 * 壳结构（侧边栏 + 移动端顶栏 + 页面边距）由 AdminShell 统一提供；登录页面使用独立布局。
 * 管理员身份由 AdminSessionProvider 统一请求一次，供布局与各页面共享。
 */
export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();

  // 登录页面使用独立的简洁布局
  // 搜索引擎屏蔽由 robots.txt 的 Disallow: /admin 统一负责；
  // 客户端组件中的 <meta name="robots"> 渲染在 body 内，搜索引擎会忽略，故不再输出
  if (pathname === "/admin-login") {
    return (
      <Suspense
        fallback={<div className="flex min-h-dvh items-center justify-center">加载中...</div>}
      >
        {children}
      </Suspense>
    );
  }

  return (
    <ToastProvider>
      <AdminSessionProvider>
        <AdminShell>{children}</AdminShell>
      </AdminSessionProvider>
    </ToastProvider>
  );
}
