"use client";
import React, { useMemo, useCallback } from "react";

import { m, AnimatePresence, useReducedMotion } from "framer-motion";
import { Link } from "next-view-transitions";
import { usePathname } from "next/navigation";
import { Menu, X, Home, BookOpen, HelpCircle, ShoppingBag } from "lucide-react";
import { cn, isCurrentPage, isBottomNavHiddenRoute } from "@/lib/utils";
import { useLayout } from "@/contexts/LayoutContext";
import { useAuth } from "@/contexts/AuthContext";
import { AboutIcon } from "./icons/AboutIcon";

/**
 * 导航项配置
 */
interface NavItem {
  href: string;
  label: string;
  labelEn: string;
  icon: React.ComponentType<{ className?: string }>;
}

const allNavItems: NavItem[] = [
  { href: "/products", label: "产品系列", labelEn: "Products", icon: ShoppingBag },
  { href: "/guide", label: "护肤指南", labelEn: "Guide", icon: BookOpen },
  { href: "/faq", label: "常见问题", labelEn: "FAQ", icon: HelpCircle },
  { href: "/about", label: "品牌故事", labelEn: "About", icon: AboutIcon },
  { href: "/", label: "首页", labelEn: "Home", icon: Home },
];

const homeNavItem = allNavItems.find((item) => item.href === "/")!;
const storyNavItem = allNavItems.find((item) => item.href === "/about")!;

/**
 * 桌面端左侧 Story 导航
 */
function DesktopStoryNav({ pathname }: { pathname: string }) {
  const Icon = storyNavItem.icon;
  const isActive = isCurrentPage(pathname, storyNavItem.href);

  return (
    <div className="hidden items-center gap-6 lg:flex">
      <Link
        href={storyNavItem.href}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "group flex items-center gap-2 rounded-xl px-3 py-2 transition-all duration-300",
          isActive ? "bg-brand-charcoal/[0.05]" : "hover:bg-brand-charcoal/[0.03]"
        )}
      >
        <Icon
          className={cn(
            "h-6 w-6 transition-all duration-300 group-hover:scale-105",
            isActive
              ? "text-brand-primary"
              : "text-brand-charcoal-light group-hover:text-brand-primary"
          )}
        />
        <span
          className={cn(
            "text-[14px] font-light tracking-[0.08em] transition-colors duration-300",
            isActive
              ? "text-brand-charcoal"
              : "text-brand-charcoal/60 group-hover:text-brand-charcoal"
          )}
        >
          {storyNavItem.label}
        </span>
      </Link>

      {/* 垂直分割线 */}
      <div className="h-6 w-px bg-brand-charcoal/15" />
    </div>
  );
}

/**
 * 底部导航栏组件 - 全局单例
 * 自动根据 pathname 高亮，并根据 LayoutContext 控制显示/隐藏
 */
export function BottomNavBar() {
  const pathname = usePathname();
  const shouldReduceMotion = useReducedMotion();
  const { isDrawerOpen, setDrawerOpen, isNavMenuOpen, setNavMenuOpen, isDrawerAnimating } =
    useLayout();
  const { activeModal, userCenterOpen } = useAuth();

  const currentPage = useMemo(
    () => allNavItems.find((item) => isCurrentPage(pathname, item.href))?.href || homeNavItem.href,
    [pathname]
  );

  const primaryNav = useMemo(
    () => allNavItems.find((item) => item.href === currentPage) || homeNavItem,
    [currentPage]
  );

  const otherNavItems = useMemo(
    () => allNavItems.filter((item) => item.href !== currentPage),
    [currentPage]
  );

  const handleNavClick = useCallback(
    (href: string, e: React.MouseEvent) => {
      if (isCurrentPage(pathname, href)) {
        e.preventDefault();
        setDrawerOpen(true);
      }
    },
    [pathname, setDrawerOpen]
  );

  const PrimaryIcon = primaryNav.icon;
  const isPrimaryActive = isCurrentPage(pathname, primaryNav.href);

  // 独立全屏布局页面隐藏底部导航栏
  const isStandalonePage =
    pathname === "/services" ||
    pathname === "/careers" ||
    pathname === "/contact" ||
    pathname === "/terms" ||
    pathname === "/privacy";

  // 当抽屉展开、动画中、登录弹窗、用户中心面板或联系我们弹窗激活时，隐藏导航栏
  const isVisible =
    !isDrawerOpen &&
    !isDrawerAnimating &&
    !activeModal &&
    !userCenterOpen &&
    !isBottomNavHiddenRoute(pathname);

  // 尊重用户减少动画偏好
  const dockTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const };

  const menuTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.2, ease: [0.4, 0, 0.2, 1] as const };

  const iconTransition = shouldReduceMotion ? { duration: 0 } : { duration: 0.15 };

  return (
    <>
      {/* 移动端菜单遮罩层 */}
      <AnimatePresence>
        {isNavMenuOpen && isVisible && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={menuTransition}
            className="fixed inset-0 z-40 bg-brand-charcoal/30 backdrop-blur-sm lg:hidden"
            onClick={() => setNavMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* 底部导航容器 - 抽屉展开时平滑滑出 */}
      <AnimatePresence>
        {isVisible && (
          <m.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={dockTransition}
            className={cn(
              "pointer-events-none fixed bottom-4 left-0 right-0 z-50 mx-auto w-full max-w-[95%] pb-[env(safe-area-inset-bottom)] lg:bottom-6 lg:max-w-[700px] xl:max-w-[800px] 2xl:max-w-[1200px]",
              isStandalonePage && "hidden"
            )}
          >
            {/* 移动端弹出菜单 */}
            <AnimatePresence>
              {isNavMenuOpen && (
                <m.div
                  data-testid="mobile-nav-menu"
                  id="mobile-nav-menu"
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={menuTransition}
                  className="pointer-events-auto absolute bottom-[calc(100%+12px)] right-0 z-50 w-56 rounded-2xl bg-brand-cream p-2 shadow-[0_8px_30px_-8px_theme(colors.brand.charcoal/0.1)] lg:hidden"
                >
                  {/* 指向下方的三角箭头 */}
                  <div
                    className="absolute -bottom-1.5 right-4 h-3 w-3 rotate-45 bg-brand-cream"
                    aria-hidden="true"
                  />
                  <div className="relative flex flex-col gap-1.5">
                    {otherNavItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setNavMenuOpen(false)}
                          className="group flex items-center gap-3 rounded-2xl bg-transparent px-3 py-3 transition-all hover:bg-brand-charcoal/[0.03] active:scale-[0.97] active:bg-brand-charcoal/[0.05]"
                        >
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/40 transition-colors group-hover:bg-white/60">
                            <Icon className="h-5 w-5 text-brand-primary" />
                          </div>
                          <div className="flex flex-col">
                            <span
                              className="text-[14px] font-light leading-[21px] tracking-[0.08em] text-brand-charcoal"
                              style={{
                                fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif",
                              }}
                            >
                              {item.label}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </m.div>
              )}
            </AnimatePresence>

            <nav
              className={cn(
                "pointer-events-auto flex items-center justify-between",
                "rounded-2xl bg-brand-cream px-4 py-3 shadow-[0_1px_1px_theme(colors.brand.charcoal/0.02),0_8px_24px_-6px_theme(colors.brand.charcoal/0.08)]",
                "lg:h-[76px] lg:rounded-[20px] lg:px-8 lg:py-0",
                "xl:px-10"
              )}
              aria-label="主要导航"
            >
              {/* 移动端左侧主导航 (动态) */}
              <Link
                data-testid="mobile-primary-nav"
                href={primaryNav.href}
                onClick={(e) => handleNavClick(primaryNav.href, e)}
                aria-current={isPrimaryActive ? "page" : undefined}
                aria-describedby={isPrimaryActive ? "current-page-hint" : undefined}
                className={cn(
                  "group relative flex items-center gap-2 rounded-xl px-2 py-2 transition-all active:scale-[0.97] active:opacity-70 lg:hidden",
                  isPrimaryActive ? "bg-brand-charcoal/[0.05]" : "hover:bg-brand-charcoal/[0.03]"
                )}
              >
                {/* 当前位置左侧金色竖条 */}
                {isPrimaryActive && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-brand-primary"
                  />
                )}
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/40">
                  <PrimaryIcon className="h-6 w-6 text-brand-primary" />
                </div>
                  <div className="flex flex-col">
                    <span
                      className="text-[14px] font-light leading-[22px] tracking-[0.08em] text-brand-charcoal"
                      style={{ fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif" }}
                    >
                      {primaryNav.label}
                    </span>
                </div>
              </Link>

              {/* 桌面端左侧固定导航 */}
              <DesktopStoryNav pathname={pathname} />

              {/* 移动端：菜单按钮 */}
              <button
                data-testid="mobile-menu-button"
                type="button"
                onClick={() => setNavMenuOpen(!isNavMenuOpen)}
                aria-expanded={isNavMenuOpen}
                aria-controls="mobile-nav-menu"
                aria-label={isNavMenuOpen ? "关闭菜单" : "打开菜单"}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-brand-charcoal/10 bg-transparent transition-colors active:bg-brand-beige/50 lg:hidden"
              >
                <AnimatePresence mode="wait" initial={false}>
                  {isNavMenuOpen ? (
                    <m.div
                      key="close"
                      initial={{ opacity: 0, rotate: -90 }}
                      animate={{ opacity: 1, rotate: 0 }}
                      exit={{ opacity: 0, rotate: 90 }}
                      transition={iconTransition}
                    >
                      <X className="h-5 w-5 text-brand-primary" />
                    </m.div>
                  ) : (
                    <m.div
                      key="menu"
                      initial={{ opacity: 0, rotate: 90 }}
                      animate={{ opacity: 1, rotate: 0 }}
                      exit={{ opacity: 0, rotate: -90 }}
                      transition={iconTransition}
                    >
                      <Menu className="h-5 w-5 text-brand-primary" />
                    </m.div>
                  )}
                </AnimatePresence>
              </button>

              {/* 桌面端右侧固定导航列表 */}
              <div
                data-testid="desktop-nav-list"
                className="hidden items-center gap-1 lg:flex xl:gap-2"
              >
                {allNavItems
                  .filter((item) => item.href !== "/about")
                  .map((item) => {
                    const Icon = item.icon;
                    const isHome = item.href === "/";
                    const isActive = isCurrentPage(pathname, item.href);

                    return (
                      <React.Fragment key={item.href}>
                        {/* 在首页前添加分割线 */}
                        {isHome && <div className="mx-2 h-6 w-px bg-brand-charcoal/15 xl:mx-3" />}
                        <Link
                          href={item.href}
                          onClick={(e) => handleNavClick(item.href, e)}
                          aria-current={isActive ? "page" : undefined}
                          aria-describedby={isActive ? "current-page-hint" : undefined}
                          className={cn(
                            "group flex items-center gap-2 rounded-xl px-3 py-2 text-[14px] font-light tracking-[0.08em] transition-all duration-300 ease-out focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-charcoal",
                            isActive
                              ? "bg-brand-charcoal/[0.05] text-brand-charcoal"
                              : "text-brand-charcoal/60 hover:bg-brand-charcoal/[0.03] hover:text-brand-charcoal"
                          )}
                        >
                          <Icon
                            className={cn(
                              "h-6 w-6 transition-all duration-300 ease-out group-hover:scale-105",
                              isActive
                                ? "text-brand-primary"
                                : "text-brand-charcoal-light group-hover:text-brand-primary"
                            )}
                          />
                          <span>{item.label}</span>
                        </Link>
                      </React.Fragment>
                    );
                  })}
              </div>
            </nav>
          </m.div>
        )}
      </AnimatePresence>

      {/* 当前页操作提示（仅对屏幕阅读器可见） */}
      <span id="current-page-hint" className="sr-only">
        点击打开当前页详情
      </span>
    </>
  );
}
