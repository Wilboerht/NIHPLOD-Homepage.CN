"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";

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

  // 登录页面使用独立的简洁布局
  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* TODO: Sidebar 组件 */}
      <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-gray-200 bg-white">
        <div className="flex h-16 items-center justify-center border-b border-gray-200">
          <span className="font-serif text-xl text-brand-charcoal">NIHPLOD CMS</span>
        </div>
        <nav className="p-4">
          <p className="text-sm text-gray-500">侧边栏占位</p>
        </nav>
      </aside>

      {/* 主内容区域 */}
      <div className="ml-64 flex-1">
        {/* TODO: AdminHeader 组件 */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
          <span className="text-sm text-gray-500">顶部导航占位</span>
        </header>

        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
