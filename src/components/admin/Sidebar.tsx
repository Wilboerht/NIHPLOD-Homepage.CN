"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, X, ChevronLeft, ChevronRight } from "lucide-react";
import { adminNavItems, type NavItem } from "@/config/admin-nav";
import { cn } from "@/lib/utils";

interface SidebarProps {
  isOpen: boolean;
  isCollapsed: boolean;
  isMobile: boolean;
  onClose: () => void;
  onToggleCollapse: () => void;
}

/**
 * 后台侧边栏组件
 */
export function Sidebar({
  isOpen,
  isCollapsed,
  isMobile,
  onClose,
  onToggleCollapse,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  // 处理登出
  const handleLogout = async () => {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error("登出失败:", error);
    }
  };

  // 检查导航项是否激活
  const isActive = (item: NavItem) => {
    if (item.href === "/admin") {
      return pathname === "/admin";
    }
    return pathname.startsWith(item.href);
  };

  // 侧边栏内容
  const sidebarContent = (
    <>
      {/* Logo 区域 */}
      <div
        className={cn(
          "flex h-16 items-center border-b border-gray-200",
          isCollapsed && !isMobile ? "justify-center px-2" : "justify-between px-4"
        )}
      >
        <Link href="/admin" className="flex items-center gap-2" onClick={onClose}>
          {isCollapsed && !isMobile ? (
            <span className="font-serif text-xl font-bold text-brand-gold">N</span>
          ) : (
            <Image
              src="/images/NIHPLOD-logo.svg"
              alt="NIHPLOD"
              width={120}
              height={40}
              className="h-8 w-auto object-contain"
              priority
            />
          )}
        </Link>

        {/* 移动端关闭按钮 */}
        {isMobile && (
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
            aria-label="关闭菜单"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* 导航菜单 */}
      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-1">
          {adminNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={isMobile ? onClose : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-brand-gold/10 text-brand-gold"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                    isCollapsed && !isMobile && "justify-center px-2"
                  )}
                  title={isCollapsed && !isMobile ? item.title : undefined}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  {(!isCollapsed || isMobile) && <span>{item.title}</span>}
                  {(!isCollapsed || isMobile) && item.badge !== undefined && (
                    <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">
                      {item.badge}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* 底部区域 */}
      <div className="border-t border-gray-200 p-3">
        {/* 折叠按钮（桌面端） */}
        {!isMobile && (
          <button
            onClick={onToggleCollapse}
            className={cn(
              "mb-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900",
              isCollapsed && "justify-center px-2"
            )}
            title={isCollapsed ? "展开侧边栏" : "折叠侧边栏"}
          >
            {isCollapsed ? (
              <ChevronRight className="h-5 w-5" />
            ) : (
              <>
                <ChevronLeft className="h-5 w-5" />
                <span>折叠菜单</span>
              </>
            )}
          </button>
        )}

        {/* 登出按钮 */}
        <button
          onClick={handleLogout}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600",
            isCollapsed && !isMobile && "justify-center px-2"
          )}
          title={isCollapsed && !isMobile ? "退出登录" : undefined}
        >
          <LogOut className="h-5 w-5" />
          {(!isCollapsed || isMobile) && <span>退出登录</span>}
        </button>
      </div>
    </>
  );

  // 移动端：使用覆盖层
  if (isMobile) {
    return (
      <>
        {/* 遮罩层 */}
        <div
          className={cn(
            "fixed inset-0 z-40 bg-black/50 transition-opacity duration-300",
            isOpen ? "opacity-100" : "pointer-events-none opacity-0"
          )}
          onClick={onClose}
          aria-hidden="true"
        />

        {/* 侧边栏 */}
        <aside
          className={cn(
            "fixed left-0 top-0 z-50 flex h-screen w-72 flex-col bg-white shadow-xl transition-transform duration-300 ease-in-out",
            isOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          {sidebarContent}
        </aside>
      </>
    );
  }

  // 桌面端：固定侧边栏
  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-gray-200 bg-white transition-all duration-300",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      {sidebarContent}
    </aside>
  );
}
