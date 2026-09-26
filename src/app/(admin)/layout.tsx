"use client";

import { ReactNode, Suspense } from "react";
import { usePathname } from "next/navigation";
import { Sidebar, AdminHeader } from "@/components/admin";
import { useSidebar } from "@/hooks";
import { cn } from "@/lib/utils";
import { ToastProvider } from "@/components/ui/Toast";
import { AdminSessionProvider, useAdminSession } from "@/contexts/AdminSessionContext";

interface AdminLayoutProps {
  children: ReactNode;
}

/**
 * 后台管理布局
 * 包含侧边栏和顶部导航；登录页面使用独立布局。
 * 管理员身份由 AdminSessionProvider 统一请求一次，供布局与各页面共享。
 */
export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();

  // 登录页面使用独立的简洁布局
  if (pathname === "/admin-login") {
    return (
      <Suspense
        fallback={<div className="flex min-h-dvh items-center justify-center">加载中...</div>}
      >
        <meta name="robots" content="noindex, nofollow" />
        {children}
      </Suspense>
    );
  }

  return (
    <ToastProvider>
      <meta name="robots" content="noindex, nofollow" />
      <AdminSessionProvider>
        <AdminShell>{children}</AdminShell>
      </AdminSessionProvider>
    </ToastProvider>
  );
}

function AdminShell({ children }: AdminLayoutProps) {
  const { isOpen, isCollapsed, isMobile, toggle, close, toggleCollapse } = useSidebar();
  const { role, name, permissions, loading } = useAdminSession();

  return (
    <div className="min-h-dvh bg-gray-50 font-sans">
      {/* 侧边栏 */}
      <Sidebar
        isOpen={isOpen}
        isCollapsed={isCollapsed}
        isMobile={isMobile}
        onClose={close}
        onToggleCollapse={toggleCollapse}
        permissions={loading ? undefined : Array.from(permissions)}
      />

      {/* 主内容区域 */}
      <div
        className={cn(
          "flex min-h-dvh flex-col transition-all duration-300",
          isMobile ? "ml-0" : isCollapsed ? "ml-16" : "ml-64"
        )}
      >
        {/* 顶部导航 */}
        <AdminHeader onMenuClick={toggle} isMobile={isMobile} userName={name} userRole={role} />

        {/* 页面内容 */}
        <main className="flex-1 p-4 md:p-6">
          <Suspense fallback={<div className="flex items-center justify-center py-8">加载中...</div>}>
            {children}
          </Suspense>
        </main>

        {/* 页脚 */}
        <footer className="px-4 py-4 text-center text-[11px] font-light tracking-widest text-brand-charcoal/40 md:px-6">
          © {new Date().getFullYear()} NIHPLOD All Rights Reserved.
        </footer>
      </div>
    </div>
  );
}
