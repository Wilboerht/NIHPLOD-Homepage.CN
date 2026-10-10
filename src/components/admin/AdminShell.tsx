"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode, Suspense } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Globe,
  Loader2,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { adminNavItems, getBreadcrumbs, type NavItem } from "@/config/admin-nav";
import { ROLE_LABELS, type AdminRoleValue } from "@/lib/admin-permissions";
import { apiGet, apiPost } from "@/lib/api-client";
import { apiConsole } from "@/lib/logger";
import { cn } from "@/lib/utils";
import { useAdminSession } from "@/contexts/AdminSessionContext";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useScrollLock } from "@/hooks/useScrollLock";
import { IconButton } from "./IconButton";

/**
 * 管理端壳：w-60 侧边栏 + 移动端抽屉 + 统一页面边距
 * - 导航由 adminNavItems 配置驱动（分组 + 权限过滤），样式对齐工具面板风格
 * - 页面边距只由壳提供（px-4 py-6 sm:px-6 lg:px-8 lg:py-8），内容容器 mx-auto max-w-7xl；
 *   窄页（表单/设置）自行用 max-w-3xl 等收敛
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { role, name, permissions, loading } = useAdminSession();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState<number | undefined>(undefined);
  const drawerTrapRef = useFocusTrap(drawerOpen);

  const permissionList = loading ? undefined : Array.from(permissions);

  // 路由变化时收起移动端抽屉（渲染期间调整状态，避免 effect 级联渲染）
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setDrawerOpen(false);
  }

  // 抽屉打开时锁定背景滚动
  useScrollLock(drawerOpen);

  // 加载未读留言数（badge）：无 messages:read 权限的角色跳过请求，避免必然 403
  useEffect(() => {
    if (!permissionList || !permissionList.includes("messages:read")) return;
    let cancelled = false;
    apiGet<{ unreadCount: number }>("/api/admin/messages?pageSize=1&status=unread")
      .then((data) => {
        if (!cancelled) setUnreadMessages(data.unreadCount);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, pathname]);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await apiPost("/api/admin/logout");
      router.push("/admin-login");
      router.refresh();
    } catch (error) {
      apiConsole.error("登出失败:", error);
      setLoggingOut(false);
    }
  };

  // 移动端顶栏标题：取面包屑最后一级
  const breadcrumbs = getBreadcrumbs(pathname);
  const pageTitle = breadcrumbs[breadcrumbs.length - 1]?.title ?? "管理面板";

  return (
    <div className="min-h-dvh bg-white font-sans">
      {/* 桌面端侧边栏 */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-brand-charcoal/10 bg-white transition-all duration-300 lg:flex",
          collapsed ? "w-16" : "w-60"
        )}
      >
        <SidebarContent
          pathname={pathname}
          permissions={permissionList}
          unreadMessages={unreadMessages}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
          userName={name}
          userRole={role}
          onLogout={handleLogout}
          loggingOut={loggingOut}
        />
      </aside>

      {/* 移动端顶栏（sticky：汉堡 + 当前页标题） */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-brand-charcoal/10 bg-white/80 px-4 backdrop-blur lg:hidden">
        <IconButton label="打开导航菜单" onClick={() => setDrawerOpen(true)} className="-ml-2">
          <Menu className="h-5 w-5" />
        </IconButton>
        <span className="text-sm font-semibold text-brand-charcoal">{pageTitle}</span>
      </header>

      {/* 移动端抽屉 */}
      <div
        className={cn(
          "fixed inset-0 z-[90] bg-black/50 transition-opacity duration-300 lg:hidden",
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-[95] flex w-72 flex-col border-r border-brand-charcoal/10 bg-white transition-[transform,visibility] duration-300 ease-in-out lg:hidden",
          drawerOpen ? "translate-x-0" : "invisible -translate-x-full"
        )}
      >
        <div ref={drawerTrapRef} role="dialog" aria-modal="true" aria-label="导航菜单" className="h-full w-full">
          <SidebarContent
            pathname={pathname}
            permissions={permissionList}
            unreadMessages={unreadMessages}
            onNavigate={() => setDrawerOpen(false)}
            onClose={() => setDrawerOpen(false)}
            userName={name}
            userRole={role}
            onLogout={handleLogout}
            loggingOut={loggingOut}
          />
        </div>
      </aside>

      {/* 主内容区：页面边距只由壳提供 */}
      <main
        className={cn(
          "min-h-dvh px-4 py-6 transition-[padding] duration-300 sm:px-6 lg:px-8 lg:py-8",
          collapsed ? "lg:pl-24" : "lg:pl-[17rem]"
        )}
      >
        <div className="mx-auto max-w-7xl">
          <Suspense
            fallback={<div className="flex items-center justify-center py-8">加载中...</div>}
          >
            {children}
          </Suspense>
        </div>
        <footer className="mx-auto max-w-7xl pt-8 text-center text-[11px] font-light tracking-widest text-brand-charcoal/40">
          © {new Date().getFullYear()} NIHPLOD All Rights Reserved.
        </footer>
      </main>
    </div>
  );
}

interface SidebarContentProps {
  pathname: string;
  /** 当前管理员有效权限（未加载完成时显示骨架） */
  permissions?: string[];
  unreadMessages?: number;
  /** 桌面端折叠为图标模式 */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
  onClose?: () => void;
  userName?: string;
  userRole?: string;
  onLogout: () => void;
  loggingOut: boolean;
}

function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/admin") return pathname === "/admin";
  return pathname.startsWith(item.href);
}

function SidebarContent({
  pathname,
  permissions,
  unreadMessages,
  collapsed = false,
  onToggleCollapse,
  onNavigate,
  onClose,
  userName,
  userRole,
  onLogout,
  loggingOut,
}: SidebarContentProps) {
  const itemCls = "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors";
  const activeCls = cn(itemCls, "bg-brand-primary/10 text-brand-primary font-medium");
  const inactiveCls = cn(
    itemCls,
    "text-brand-charcoal/60 hover:text-brand-charcoal hover:bg-brand-charcoal/[0.04]"
  );

  return (
    <div className="flex h-full flex-col">
      {/* 品牌区 */}
      <div className="flex items-center justify-between px-4 pb-4 pt-5">
        <Link
          href="/admin"
          onClick={onNavigate}
          className="flex items-center gap-2 text-base font-semibold tracking-tight text-brand-charcoal"
        >
          {collapsed ? (
            <span className="font-serif text-xl font-bold text-brand-primary">N</span>
          ) : (
            <>
              <Image
                src="/images/NIHPLOD-logo.svg"
                alt="NIHPLOD"
                width={96}
                height={32}
                className="h-6 w-auto object-contain"
                priority
              />
              <span>管理面板</span>
            </>
          )}
        </Link>
        {onClose && (
          <IconButton label="关闭导航菜单" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        )}
      </div>

      {/* 导航（配置驱动 + 分组 + 权限过滤） */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {!permissions ? (
          // 权限加载中：显示骨架屏，避免权限菜单闪烁
          <div className="flex flex-col gap-0.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={`skeleton-${i}`} className="flex items-center gap-2 rounded-lg px-3 py-2">
                <div className="h-4 w-4 flex-shrink-0 animate-pulse rounded bg-brand-charcoal/10" />
                {!collapsed && (
                  <div className="h-4 flex-1 animate-pulse rounded bg-brand-charcoal/10" />
                )}
              </div>
            ))}
          </div>
        ) : (
          (() => {
            const filtered = adminNavItems.filter(
              (item) => !item.permission || permissions.includes(item.permission)
            );
            const groups: { label: string | null; items: typeof filtered }[] = [];
            for (const item of filtered) {
              const label = item.group ?? null;
              const last = groups[groups.length - 1];
              if (last && last.label === label) last.items.push(item);
              else groups.push({ label, items: [item] });
            }

            return groups.map((group, gi) => (
              <div key={group.label || `group-${gi}`} className="flex flex-col gap-0.5">
                {group.label && !collapsed && (
                  <p className="px-3 pb-1 pt-3 text-xs font-medium uppercase tracking-wider text-brand-charcoal/40">
                    {group.label}
                  </p>
                )}
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item, pathname);
                  // 留言管理：显示未读数 badge（0 时不显示）
                  const badge =
                    item.href === "/admin/messages"
                      ? unreadMessages && unreadMessages > 0
                        ? unreadMessages
                        : undefined
                      : item.badge;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      title={collapsed ? item.title : undefined}
                      className={cn(
                        active ? activeCls : inactiveCls,
                        collapsed && "justify-center px-2"
                      )}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                      {!collapsed && badge !== undefined && (
                        <span className="ml-auto rounded-full bg-red-400 px-1.5 py-0.5 text-[10px] leading-none text-white">
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ));
          })()
        )}
      </nav>

      {/* 底部：用户信息 + 查看站点 + 退出登录 + 折叠 */}
      <div className="flex flex-col gap-0.5 border-t border-brand-charcoal/10 px-3 pb-4 pt-3">
        {!collapsed && (userName || userRole) && (
          <div className="px-3 pb-2">
            <p className="truncate text-sm font-medium text-brand-charcoal">
              {userName || "管理员"}
            </p>
            <p className="text-xs text-brand-charcoal/50">
              {userRole ? (ROLE_LABELS[userRole as AdminRoleValue] ?? "管理员") : "管理员"}
            </p>
          </div>
        )}
        <Link
          href="/"
          onClick={onNavigate}
          className={cn(inactiveCls, collapsed && "justify-center px-2")}
          title={collapsed ? "查看站点" : undefined}
        >
          <Globe className="h-4 w-4 flex-shrink-0" />
          {!collapsed && <span>查看站点</span>}
        </Link>
        <button
          onClick={onLogout}
          disabled={loggingOut}
          title={collapsed ? "退出登录" : undefined}
          className={cn(
            inactiveCls,
            "w-full text-left hover:text-red-500 disabled:opacity-50",
            collapsed && "justify-center px-2"
          )}
        >
          {loggingOut ? (
            <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4 flex-shrink-0" />
          )}
          {!collapsed && <span>{loggingOut ? "退出中..." : "退出登录"}</span>}
        </button>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            title={collapsed ? "展开侧边栏" : "折叠侧边栏"}
            className={cn(inactiveCls, "w-full text-left", collapsed && "justify-center px-2")}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4 flex-shrink-0" />
            ) : (
              <ChevronLeft className="h-4 w-4 flex-shrink-0" />
            )}
            {!collapsed && <span>折叠菜单</span>}
          </button>
        )}
      </div>
    </div>
  );
}
