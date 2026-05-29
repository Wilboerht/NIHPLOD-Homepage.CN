"use client";
import React from "react";

import { m, AnimatePresence } from "framer-motion";
import { Link } from "next-view-transitions";
import { usePathname } from "next/navigation";
import { Menu, X, Home, BookOpen, HelpCircle, ShoppingBag } from "lucide-react";
import { cn, isCurrentPage } from "@/lib/utils";
import { useLayout } from "@/contexts/LayoutContext";
import { useAuth } from "@/contexts/AuthContext";

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
 * 自定义 "关于旎柏" SVG 图标
 */
const CustomAboutIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg"><path stroke="currentColor" stroke-width="1.82" d="M2.889 12.422c0 5.584 4.527 10.11 10.11 10.11q1.039-.001 2.017-.2c1.034-.228.587 1.232 1.31 1.353.883.147 6.785-5.082 6.785-11.263C23.111 6.837 18.584 2.31 13 2.31S2.889 6.837 2.889 12.42Z" /><path fill="currentColor" d="M8.602 17.29a.29.29 0 0 1-.29-.288V9.734a.29.29 0 0 1 .48-.218l1.415 1.238a.3.3 0 0 1 .099.218v6.03c0 .16-.13.288-.29.288zm-.192-6.825a.3.3 0 0 1-.097-.216V8.545c0-.31.367-.476.6-.27l5.575 4.928V8.33c0-.16.13-.289.289-.289h1.415c.16 0 .289.13.289.29v8.456a.361.361 0 0 1-.6.271z" /><circle cx="18.628" cy="16.209" r=".934" fill="currentColor" /></svg>
);

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
    const { activeModal, userCenterOpen, contactOpen } = useAuth();

    // 简单映射 pathname 到 currentPage，仅用于高亮和主导航判定
    // 如果路径是嵌套的（如 /products/123），可能需要 startsWith 逻辑
    // 这里暂时做精准匹配或一级匹配
    const currentPage = allNavItems.find(item => isCurrentPage(pathname, item.href))?.href || "/";

    // 根据当前页面获取主导航项和其他导航项
    // allNavItems 长度为 5，索引 0-4，首页为索引 4
    const primaryNav = allNavItems.find(item => item.href === currentPage) || allNavItems[4];
    const otherNavItems = allNavItems.filter(item => item.href !== currentPage);

    /**
     * 处理导航点击
     * 如果点击的是当前页面，则展开抽屉而不是跳转
     */
    const handleNavClick = (href: string, e: React.MouseEvent) => {
        if (isCurrentPage(pathname, href)) {
            e.preventDefault();
            setDrawerOpen(true);
        }
    };


    const PrimaryIcon = primaryNav.icon;

    // 当抽屉展开、登录弹窗、用户中心面板或联系我们弹窗激活时，隐藏导航栏
    const isVisible = !isDrawerOpen && !activeModal && !userCenterOpen && !contactOpen;

    // 服务入口页面在移动端隐藏底部导航栏（实现全屏效果）
    const isServicesPage = pathname === '/services';

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
                        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
                        onClick={() => setIsNavMenuOpen(false)}
                    />
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
                        className={cn(
                            "fixed bottom-4 left-0 right-0 z-50 mx-auto w-full max-w-[95%] pointer-events-none pb-[env(safe-area-inset-bottom)] lg:bottom-6 lg:max-w-[700px] xl:max-w-[800px] 2xl:max-w-[1200px]",
                            isServicesPage && "max-lg:hidden"
                        )}
                        role="banner"
                    >
                        {/* 移动端弹出菜单 - 嵌套在 header 内以实现 Dock 对齐 */}
                        <AnimatePresence>
                            {isNavMenuOpen && (
                                <m.div
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                                    className="absolute bottom-[calc(100%+12px)] right-0 z-50 w-48 rounded-2xl bg-[#F8F7F3] p-2 pointer-events-auto lg:hidden"
                                >
                                    <div className="flex flex-col gap-1.5">
                                        {otherNavItems.map((item) => {
                                            const Icon = item.icon;
                                            return (
                                                <Link
                                                    key={item.href}
                                                    href={item.href}
                                                    onClick={() => setIsNavMenuOpen(false)}
                                                    className="flex items-center gap-3 rounded-2xl px-3 py-3 transition-all active:scale-[0.97] active:bg-brand-beige/20 bg-transparent"
                                                >
                                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F0EDE1]">
                                                        <Icon className="h-5 w-5 text-[#B5AC88]" />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[14px] font-medium leading-[21px] text-[#00263E]" style={{ fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif" }}>{item.label}</span>
                                                        <span className="text-[10px] font-medium uppercase tracking-wide text-[rgba(0,38,62,0.5)]">{item.labelEn}</span>
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
                                "flex items-center justify-between pointer-events-auto",
                                // Mobile: compact rounded design
                                "rounded-2xl bg-[#F8F7F3] px-4 py-4",
                                // Desktop: dock-style design from reference
                                "lg:rounded-[20px] lg:bg-[#F8F7F3] lg:px-10 lg:py-0 lg:h-[100px]",
                                "lg:shadow-[0_20px_50px_rgba(0,0,0,0.15),inset_0_1px_1px_rgba(255,255,255,0.8)]",
                                "lg:backdrop-blur-none"
                            )}
                            aria-label="主要导航"
                        >
                            {/* ================= 移动端左侧主导航 (动态) ================= */}
                            <Link
                                href={primaryNav.href}
                                onClick={(e) => handleNavClick(primaryNav.href, e)}
                                className="group flex items-center gap-2 transition-opacity active:opacity-70 lg:hidden"
                            >
                                {/* 图标容器 */}
                                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#F0EDE1]">
                                    <PrimaryIcon className="h-6 w-6 text-[#B5AC88]" />
                                </div>
                                {/* 文字 */}
                                <div className="flex flex-col">
                                    <span className="text-[14px] font-medium leading-[21px] text-[#00263E]" style={{ fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif" }}>
                                        {primaryNav.label}
                                    </span>
                                    <span className="text-[10px] font-medium uppercase tracking-wide text-[rgba(0,38,62,0.5)]">
                                        {primaryNav.labelEn}
                                    </span>
                                </div>
                            </Link>

                            {/* ================= 桌面端左侧固定导航 (Story - 关于旎柏 - 极简横向锁定) ================= */}
                            {(() => {
                                const storyItem = allNavItems.find(item => item.href === "/about")!;
                                const Icon = storyItem.icon;

                                return (
                                    <div className="hidden items-center gap-8 lg:flex">
                                        <Link
                                            href={storyItem.href}
                                            onClick={(e) => handleNavClick(storyItem.href, e)}
                                            className="group flex items-center gap-3 px-2 transition-opacity duration-300 hover:opacity-70"
                                        >
                                            {/* 图标 (放大作为视觉重心) */}
                                            <Icon className="h-9 w-9 text-brand-gold transition-transform duration-500 group-hover:scale-105" />

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
                                className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#F0EDE1] transition-colors active:bg-[#E8E4D8] lg:hidden"
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
                                            <X className="h-5 w-5 text-[#B5AC88]" />
                                        </m.div>
                                    ) : (
                                        <m.div
                                            key="menu"
                                            initial={{ opacity: 0, rotate: 90 }}
                                            animate={{ opacity: 1, rotate: 0 }}
                                            exit={{ opacity: 0, rotate: -90 }}
                                            transition={{ duration: 0.15 }}
                                        >
                                            <Menu className="h-5 w-5 text-[#B5AC88]" />
                                        </m.div>
                                    )}
                                </AnimatePresence>
                            </button>

                            {/* ================= 桌面端右侧固定导航列表 ================= */}
                            {/* 排除 Story (已在左侧)，其余按顺序排列 */}
                            <div className="hidden items-center gap-3 lg:flex lg:gap-[40px]">
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
                                                <Icon className="h-8 w-8 text-[#C3BC9F] transition-all duration-[600ms] ease-[cubic-bezier(0.19,1,0.22,1)] group-hover:translate-y-[-2px] group-hover:text-brand-gold" />
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
