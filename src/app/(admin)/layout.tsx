"use client";

import { ReactNode, Suspense, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar, AdminHeader } from "@/components/admin";
import { useSidebar } from "@/hooks";
import { cn } from "@/lib/utils";
import { ToastProvider } from "@/components/ui/Toast";

interface AdminLayoutProps {
  children: ReactNode;
}

/**
 * 后台管理布局
 * 包含侧边栏和顶部导航
 * 登录页面使用独立布局
 */
export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();
  const { isOpen, isCollapsed, isMobile, toggle, close, toggleCollapse } = useSidebar();
  const [userRole, setUserRole] = useState<string | undefined>(undefined);
  const [userName, setUserName] = useState<string | undefined>(undefined);

  useEffect(() => {
    fetch("/api/admin/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data?.user) {
          setUserRole(data.data.user.role);
          setUserName(data.data.user.name);
        }
      })
      .catch(() => {
        // 静默失败，不设置角色（Sidebar 会显示骨架屏）
      });
  }, []);

  // 登录页面使用独立的简洁布局
  if (pathname === "/admin-login") {
    return (
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center">加载中...</div>}>
        {children}
      </Suspense>
    );
  }

  return (
    <ToastProvider>
      <div className="min-h-screen bg-gray-50">
        {/* 侧边栏 */}
        <Sidebar
          isOpen={isOpen}
          isCollapsed={isCollapsed}
          isMobile={isMobile}
          onClose={close}
          onToggleCollapse={toggleCollapse}
          userRole={userRole}
        />

        {/* 主内容区域 */}
        <div
          className={cn(
            "flex min-h-screen flex-col transition-all duration-300",
            isMobile ? "ml-0" : isCollapsed ? "ml-16" : "ml-64"
          )}
        >
          {/* 顶部导航 */}
          <AdminHeader onMenuClick={toggle} isMobile={isMobile} userName={userName} userRole={userRole} />

          {/* 页面内容 */}
          <main className="flex-1 p-4 md:p-6">
            <Suspense fallback={<div className="flex items-center justify-center py-8">加载中...</div>}>
              {children}
            </Suspense>
          </main>

          {/* 页脚 */}
          <footer className="px-4 py-4 text-center text-xs text-gray-400 md:px-6">
            © {new Date().getFullYear()} NIHPLOD All Rights Reserved.
          </footer>
        </div>
      </div>
    </ToastProvider>
  );
}
