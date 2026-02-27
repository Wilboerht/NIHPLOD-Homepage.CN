"use client";
import React from "react";

import { m, AnimatePresence } from "framer-motion";
import { Link } from "next-view-transitions";
import { usePathname } from "next/navigation";
import { Menu, X, Home, BookOpen, HelpCircle, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLayout } from "@/contexts/LayoutContext";

/* 
 * 备选图标导入 (随时可以换回原有的自定义 SVG 图标)
 * import { ShopIcon, StoryIcon, RitualIcon, HomeIcon, FAQIcon } from "@/components/website";
 */

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
 * 
 * 备选原有自定义图标配置:
 * [
 *   { href: "/products", label: "探索产品", labelEn: "Products", icon: ShopIcon },
 *   { href: "/guide", label: "官方指南", labelEn: "Guide", icon: RitualIcon },
 *   { href: "/faq", label: "常见问题", labelEn: "FAQ", icon: FAQIcon },
 *   { href: "/about", label: "关于旎柏", labelEn: "About", icon: StoryIcon },
 *   { href: "/", label: "首页", labelEn: "Home", icon: HomeIcon },
 * ]
 */
/**
 * 自定义 "关于旎柏" SVG 图标占位符
 * TODO: 请在此替换为您自己的 SVG <path> 等内容
 */
const CustomAboutIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="currentColor" id="_图层_2" data-name="图层 2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 188.38 178.1">
        <g id="_图层_1-2" data-name="图层 1">
            <path d="M92.74.02c28.72-.35,53.86,4.29,73.99,26.14,18.54,20.12,22.79,43.55,21.41,70.33-1.78,34.45-25.64,64.79-59,73.71-15.98,4.27-51.56,4.94-67.17-.08-1.92-.62-3.73-1.62-5.66-2.23-5.02,3.08-9.55,6.32-15.28,8.07-7.26,2.22-23.31,3.9-29.32-1.25-9.71-8.33,1.62-19.44,3.89-28.14,2.28-8.73-1.49-10.8-5.2-17.66C-7.07,96.6-2.47,50.59,23.77,24.19,43.37,4.45,65.78.35,92.74.02ZM25.56,162.47h5.21c10.91,0,17.31-11.99,27.17-10.27,5.74,1,10.62,4.48,17.43,5.23,14.45,1.59,40.42,1.23,54.11-3.43,35.76-12.17,47.89-48.68,42.35-83.68S138.34,16.94,104.88,15.72c-31.43-1.14-59.75,1-78.39,29.54-12.77,19.57-14.54,51.49-4.59,72.5,2.98,6.29,8.93,12.88,9.74,19.75,1.06,9.05-2.22,17.06-6.07,24.96Z" />
            <polygon points="105.76 97.73 105.76 48.1 120.15 48.1 120.15 123.63 109.54 123.63 70.52 72.2 70.52 122.19 56.13 122.19 56.13 46.3 66.74 46.3 105.76 97.73" />
            <path d="M137.68,106.82c3.48-.52,6.67.34,8.86,3.17,5.32,6.88-1.69,16.85-10.14,13.74s-7.19-15.65,1.28-16.91Z" />
        </g>
    </svg>
);

/**
 * 自定义 "探索产品" SVG 图标占位符
 * TODO: 请在此替换为您自己的 SVG <path> 等内容
 */


const allNavItems: NavItem[] = [

    { href: "/products", label: "探索产品", labelEn: "Products", icon: ShoppingBag },
    { href: "/guide", label: "官方指南", labelEn: "Guide", icon: BookOpen },
    { href: "/faq", label: "常见问题", labelEn: "FAQ", icon: HelpCircle },
    { href: "/about", label: "关于旎柏", labelEn: "About", icon: CustomAboutIcon },
    { href: "/", label: "首页", labelEn: "Home", icon: Home },
];

/**
 * 底部导航栏组件 - 全局单例
 * 自动根据 pathname 高亮，并根据 LayoutContext 控制显示/隐藏
 */



export function BottomNavBar() {
    const pathname = usePathname();
    const { isDrawerOpen, setDrawerOpen, isNavMenuOpen, setNavMenuOpen: setIsNavMenuOpen } = useLayout();

    // 简单映射 pathname 到 currentPage，仅用于高亮和主导航判定
    // 如果路径是嵌套的（如 /products/123），可能需要 startsWith 逻辑
    // 这里暂时做精准匹配或一级匹配
    const currentPage = allNavItems.find(item => item.href === pathname || (item.href !== "/" && pathname.startsWith(item.href)))?.href || "/";

    // 根据当前页面获取主导航项和其他导航项
    // allNavItems 长度为 5，索引 0-4，首页为索引 4
    const primaryNav = allNavItems.find(item => item.href === currentPage) || allNavItems[4];
    const otherNavItems = allNavItems.filter(item => item.href !== currentPage);

    /**
     * 处理导航点击
     * 如果点击的是当前页面，则展开抽屉而不是跳转
     */
    const handleNavClick = (href: string, e: React.MouseEvent) => {
        const isCurrentPage = href === currentPage || (href !== "/" && pathname.startsWith(href));
        if (isCurrentPage) {
            e.preventDefault();
            setDrawerOpen(true);
        } else {
            // 正常导航，Link 组件会处理
        }
    };


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
                        className="fixed bottom-[84px] right-3 z-50 w-44 rounded-2xl bg-white/95 p-2 shadow-xl backdrop-blur-md sm:hidden"
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
                                            <Icon className={cn(
                                                "h-5 w-5 text-brand-gold",
                                                item.href === "/about" && "scale-[0.85]"
                                            )} />
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
                        className="fixed bottom-4 left-0 right-0 z-50 mx-auto w-full max-w-[95%] pointer-events-none sm:bottom-6 sm:max-w-[90%] lg:bottom-8 lg:max-w-[1200px]"
                        role="banner"
                    >
                        <nav
                            className={cn(
                                "flex items-center justify-between pointer-events-auto",
                                // Mobile: compact rounded design
                                "rounded-2xl bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur-md",
                                // Desktop: dock-style design from reference
                                "sm:rounded-[20px] sm:bg-[#F0EDE1] sm:px-10 sm:py-0 sm:h-[100px]",
                                "sm:shadow-[0_20px_50px_rgba(0,0,0,0.15),inset_0_1px_1px_rgba(255,255,255,0.8)]",
                                "sm:backdrop-blur-none"
                            )}
                            aria-label="主要导航"
                        >
                            {/* ================= 移动端左侧主导航 (动态) ================= */}
                            <Link
                                href={primaryNav.href}
                                onClick={(e) => handleNavClick(primaryNav.href, e)}
                                className="group flex items-center gap-2 transition-opacity active:opacity-70 sm:hidden"
                            >
                                {/* 图标容器 */}
                                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gold/10">
                                    <PrimaryIcon className={cn(
                                        "h-6 w-6 text-brand-gold",
                                        primaryNav.href === "/about" && "scale-[0.85]"
                                    )} />
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

                            {/* ================= 桌面端左侧固定导航 (Story - 关于旎柏 - 极简横向锁定) ================= */}
                            {(() => {
                                const storyItem = allNavItems.find(item => item.href === "/about")!;
                                const Icon = storyItem.icon;

                                return (
                                    <div className="hidden items-center gap-8 sm:flex">
                                        <Link
                                            href={storyItem.href}
                                            onClick={(e) => handleNavClick(storyItem.href, e)}
                                            className="group flex items-center gap-3 px-2 transition-opacity duration-300 hover:opacity-70"
                                        >
                                            {/* 图标 (放大作为视觉重心) */}
                                            <Icon className={cn(
                                                "h-9 w-9 text-brand-gold transition-transform duration-500 group-hover:scale-105",
                                                "scale-[0.85]" // CustomAboutIcon
                                            )} />

                                            {/* 主标题 - 衬线体 大号 */}
                                            <span className="font-serif text-[18px] font-medium tracking-wide text-brand-charcoal">
                                                关于旎柏
                                            </span>
                                        </Link>

                                        {/* 垂直分割线 */}
                                        <div className="h-10 w-px bg-brand-charcoal/15" />
                                    </div>
                                );
                            })()}


                            {/* 移动端：购物车按钮 (已移除) */}


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
                            {/* 排除 Story (已在左侧)，其余按顺序排列 */}
                            <div className="hidden items-center gap-3 sm:flex sm:gap-[35px]">
                                {allNavItems.filter(item => item.href !== "/about").map((item) => {
                                    const Icon = item.icon;
                                    const isHome = item.href === "/";

                                    return (
                                        <React.Fragment key={item.href}>
                                            {/* 在首页前添加分割线 */}
                                            {isHome && (
                                                <div className="h-10 w-px bg-black/20" />
                                            )}
                                            <Link
                                                href={item.href}
                                                onClick={(e) => handleNavClick(item.href, e)}
                                                className={cn(
                                                    "group flex flex-col items-center gap-1 py-2 text-[15px] font-medium text-[#1a1a1a] transition-all duration-[600ms] ease-[cubic-bezier(0.19,1,0.22,1)]",
                                                    "hover:opacity-70"
                                                )}
                                            >
                                                <Icon className={cn(
                                                    "h-8 w-8 text-[#C3BC9F] transition-all duration-[600ms] ease-[cubic-bezier(0.19,1,0.22,1)] group-hover:translate-y-[-2px] group-hover:text-brand-gold",
                                                    // 自定义图标通常占位更满，稍微缩小一点点以在高视觉重量下保持平衡
                                                    item.href === "/about" && "scale-[0.85]"
                                                )} />
                                                <span>
                                                    {item.label}
                                                </span>
                                            </Link>
                                        </React.Fragment>
                                    );
                                })}

                                {/* 桌面端：分割线 */}
                                {/* <div className="h-10 w-px bg-black/20" /> */}

                                {/* 桌面端：购物车按钮 (已移除) */}
                            </div>
                        </nav>
                    </m.header>
                )}
            </AnimatePresence>
        </>
    );
}
