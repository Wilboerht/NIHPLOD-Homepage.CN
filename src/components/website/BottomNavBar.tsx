"use client";

import { useState } from "react";
import { m, AnimatePresence } from "framer-motion";
import { Link } from "next-view-transitions";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShopIcon, StoryIcon, RitualIcon, HomeIcon, ContactIcon } from "@/components/website";
import { useLayout } from "@/contexts/LayoutContext";

/**
 * 导航项配置
 */
interface NavItem {
    href: string;
    label: string;
    labelEn: string;
    icon: React.ComponentType<{ className?: string }>;
}

/**
 * 所有可用的导航项
 */
const allNavItems: NavItem[] = [
    { href: "/advisor", label: "护肤顾问", labelEn: "Consultant", icon: ContactIcon },
    { href: "/products", label: "了解产品", labelEn: "Products", icon: ShopIcon },
    { href: "/story", label: "关于旎柏", labelEn: "Story", icon: StoryIcon },
    { href: "/ritual", label: "护肤仪式", labelEn: "Ritual", icon: RitualIcon },
    { href: "/", label: "首页", labelEn: "Home", icon: HomeIcon },
];

/**
 * 底部导航栏组件 - 全局单例
 * 自动根据 pathname 高亮，并根据 LayoutContext 控制显示/隐藏
 */
export function BottomNavBar() {
    const pathname = usePathname();
    const { isDrawerOpen } = useLayout();
    const [isNavMenuOpen, setIsNavMenuOpen] = useState(false);

    // 简单映射 pathname 到 currentPage，仅用于高亮和主导航判定
    // 如果路径是嵌套的（如 /products/123），可能需要 startsWith 逻辑
    // 这里暂时做精准匹配或一级匹配
    const currentPage = allNavItems.find(item => item.href === pathname || (item.href !== "/" && pathname.startsWith(item.href)))?.href || "/";

    // 根据当前页面获取主导航项和其他导航项
    const primaryNav = allNavItems.find(item => item.href === currentPage) || allNavItems[4]; // 默认为Home
    const otherNavItems = allNavItems.filter(item => item.href !== currentPage);
    const AdvisorIcon = ContactIcon; // 显式获取

    const PrimaryIcon = primaryNav.icon;

    // 当抽屉展开时 (isDrawerOpen === true)，隐藏导航栏
    // 也就是 !isDrawerOpen 时显示
    const isVisible = !isDrawerOpen;

    return (
        <>
            {/* 移动端菜单遮罩层 */}
            <AnimatePresence>
                {isNavMenuOpen && isVisible && (
                    <m.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm sm:hidden"
                        onClick={() => setIsNavMenuOpen(false)}
                    />
                )}
            </AnimatePresence>

            {/* 移动端弹出菜单 */}
            <AnimatePresence>
                {isNavMenuOpen && isVisible && (
                    <m.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                        className="fixed bottom-20 right-3 z-50 w-44 rounded-2xl bg-white/95 p-2 shadow-xl backdrop-blur-md sm:hidden"
                    >
                        <div className="flex flex-col gap-1">
                            {otherNavItems.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        onClick={() => setIsNavMenuOpen(false)}
                                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors active:bg-brand-beige/50"
                                    >
                                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gold/10">
                                            <Icon className="h-5 w-5" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium text-brand-charcoal">{item.label}</span>
                                            <span className="font-serif text-[9px] uppercase tracking-wide text-brand-charcoal/50">{item.labelEn}</span>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </m.div>
                )}
            </AnimatePresence>

            {/* 底部导航栏 - 抽屉展开时平滑滑出 */}
            <AnimatePresence>
                {isVisible && (
                    <m.header
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        transition={{
                            duration: 0.6,
                            ease: [0.22, 1, 0.36, 1]
                        }}
                        className="fixed bottom-2 left-3 right-3 z-50 sm:bottom-4 sm:left-6 sm:right-6 lg:bottom-6 lg:left-16 lg:right-16"
                        role="banner"
                    >
                        <nav
                            className={cn(
                                "flex items-center justify-between",
                                "rounded-2xl bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur-md",
                                "sm:px-5 sm:py-4 lg:rounded-3xl lg:px-8 lg:py-5"
                            )}
                            aria-label="主要导航"
                        >
                            {/* ================= 移动端左侧主导航 (动态) ================= */}
                            <Link
                                href={primaryNav.href}
                                className="group flex items-center gap-2 transition-opacity active:opacity-70 sm:hidden"
                            >
                                {/* 图标容器 */}
                                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gold/10">
                                    <PrimaryIcon className="h-6 w-6" />
                                </div>
                                {/* 文字 */}
                                <div className="flex flex-col">
                                    <span className="text-sm font-semibold text-brand-charcoal">
                                        {primaryNav.label}
                                    </span>
                                    <span className="font-serif text-[10px] uppercase tracking-wide text-brand-gold/70">
                                        {primaryNav.labelEn}
                                    </span>
                                </div>
                            </Link>

                            {/* ================= 桌面端左侧固定导航 (Advisor) ================= */}
                            {(() => {
                                const advisorItem = allNavItems.find(item => item.href === "/advisor")!;
                                const AdvisorIcon = advisorItem.icon;
                                return (
                                    <Link
                                        href={advisorItem.href}
                                        className="group hidden items-center gap-4 transition-opacity hover:opacity-80 sm:flex"
                                    >
                                        {/* 图标容器 */}
                                        <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-brand-gold/10 lg:h-20 lg:w-20">
                                            <AdvisorIcon className="h-10 w-10 lg:h-14 lg:w-14" />
                                        </div>
                                        {/* 文字 */}
                                        <div className="flex flex-col">
                                            <span className="text-lg font-semibold text-brand-charcoal lg:text-2xl">
                                                {advisorItem.label}
                                            </span>

                                        </div>
                                    </Link>
                                );
                            })()}


                            {/* 移动端：菜单按钮 */}
                            <button
                                type="button"
                                onClick={() => setIsNavMenuOpen(!isNavMenuOpen)}
                                className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-beige/30 transition-colors active:bg-brand-beige/50 sm:hidden"
                                aria-label={isNavMenuOpen ? "关闭菜单" : "打开菜单"}
                            >
                                <AnimatePresence mode="wait" initial={false}>
                                    {isNavMenuOpen ? (
                                        <m.div
                                            key="close"
                                            initial={{ opacity: 0, rotate: -90 }}
                                            animate={{ opacity: 1, rotate: 0 }}
                                            exit={{ opacity: 0, rotate: 90 }}
                                            transition={{ duration: 0.15 }}
                                        >
                                            <X className="h-5 w-5 text-brand-charcoal" />
                                        </m.div>
                                    ) : (
                                        <m.div
                                            key="menu"
                                            initial={{ opacity: 0, rotate: 90 }}
                                            animate={{ opacity: 1, rotate: 0 }}
                                            exit={{ opacity: 0, rotate: -90 }}
                                            transition={{ duration: 0.15 }}
                                        >
                                            <Menu className="h-5 w-5 text-brand-charcoal" />
                                        </m.div>
                                    )}
                                </AnimatePresence>
                            </button>

                            {/* ================= 桌面端右侧固定导航列表 ================= */}
                            {/* 排除 Advisor (已在左侧)，其余按顺序排列: Products, Story, Ritual, Home */}
                            <div className="hidden items-center gap-5 sm:flex lg:gap-8">
                                {allNavItems.filter(item => item.href !== "/advisor").map((item) => {
                                    const Icon = item.icon;
                                    const isActive = currentPage === item.href;

                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className={cn(
                                                "group flex flex-col items-center gap-1 transition-opacity hover:opacity-80",
                                                isActive && "opacity-100" // 当前页面高亮逻辑可选，这里保持样式一致
                                            )}
                                        >
                                            <div className={cn(
                                                "flex h-14 w-14 items-center justify-center rounded-xl transition-colors lg:h-16 lg:w-16",
                                                isActive ? "bg-brand-beige/80" : "group-hover:bg-brand-beige/50"
                                            )}>
                                                <Icon className="h-8 w-8 lg:h-9 lg:w-9" />
                                            </div>
                                            <span className="text-xs text-brand-charcoal/70 lg:text-sm">
                                                {item.label}
                                            </span>

                                        </Link>
                                    );
                                })}
                            </div>
                        </nav>
                    </m.header>
                )}
            </AnimatePresence>
        </>
    );
}
