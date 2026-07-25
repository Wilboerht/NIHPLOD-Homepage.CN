"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, ChevronRight, LogOut, User } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { getBreadcrumbs } from "@/config/admin-nav";
import { cn } from "@/lib/utils";
import { apiPost } from "@/lib/api-client";

interface AdminHeaderProps {
  onMenuClick: () => void;
  isMobile: boolean;
  userName?: string;
  userRole?: string;
}

/**
 * 后台顶部导航组件
 */
export function AdminHeader({ onMenuClick, isMobile, userName, userRole }: AdminHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const breadcrumbs = getBreadcrumbs(pathname);

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // 处理登出
  const handleLogout = async () => {
    try {
      await apiPost("/api/admin/logout");
      router.push("/admin-login");
      router.refresh();
    } catch (error) {
      console.error("登出失败:", error);
    }
  };

  // 点击外部关闭用户菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-brand-charcoal/15 bg-white px-4 md:px-6">
      {/* 左侧：菜单按钮（移动端）+ 面包屑 */}
      <div className="flex items-center gap-4">
        {/* 移动端菜单按钮 */}
        {isMobile && (
          <button
            onClick={onMenuClick}
            className="rounded-lg p-2 text-brand-charcoal/50 hover:bg-brand-charcoal/[0.06]"
            aria-label="打开菜单"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

        {/* 面包屑导航 */}
        <nav className="flex items-center gap-1 text-sm">
          {breadcrumbs.map((item, index) => (
            <span key={item.href} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="h-4 w-4 text-brand-charcoal/50" />}
              {index === breadcrumbs.length - 1 ? (
                <span className="font-medium text-brand-charcoal">{item.title}</span>
              ) : (
                <Link
                  href={item.href}
                  className="text-brand-charcoal/50 transition-colors hover:text-brand-charcoal"
                >
                  {item.title}
                </Link>
              )}
            </span>
          ))}
        </nav>
      </div>

      {/* 右侧：用户信息 */}
      <div className="relative" ref={userMenuRef}>
        <button
          onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-brand-charcoal/80 transition-colors hover:bg-brand-charcoal/[0.06]"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary">
            <User className="h-4 w-4" />
          </div>
          <span className="hidden md:block">{userName || "加载中..."}</span>
        </button>

        {/* 用户下拉菜单 */}
        <div
          className={cn(
            "absolute right-0 top-full mt-1 w-48 rounded-lg border border-brand-charcoal/15 bg-white py-1 shadow-lg transition-all",
            isUserMenuOpen
              ? "visible translate-y-0 opacity-100"
              : "invisible -translate-y-2 opacity-0"
          )}
        >
          <div className="border-b border-brand-charcoal/8 px-4 py-2">
            <p className="text-sm font-medium text-brand-charcoal">{userName || "管理员"}</p>
            <p className="text-xs text-brand-charcoal/50">
              {userRole === "owner" ? "最高权限管理员" : "管理员"}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-brand-charcoal/80 hover:bg-brand-charcoal/[0.06]"
          >
            <LogOut className="h-4 w-4" />
            <span>退出登录</span>
          </button>
        </div>
      </div>
    </header>
  );
}
