"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

// 聊天气泡消息配置
const chatMessages = [
    { text: "Hi 🖐️ 我是护肤顾问 ", highlight: "小旎老师", suffix: ",\n很高兴见到你!" },
    { text: "为获得更好的护肤效果,\n建议先用2分钟检测下自己当前的皮肤状况哦! ", highlight: "", suffix: "♥️" },
];

export function BottomNavBar() {
    const pathname = usePathname();
    const { isDrawerOpen, setDrawerOpen, isNavMenuOpen, setNavMenuOpen: setIsNavMenuOpen } = useLayout();

    // 鼠标跟随视差效果 (Reference: Dock区域 IP 样式动效)
    const avatarRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!avatarRef.current) return;
            // 计算相对屏幕中心的偏移
            const x = (window.innerWidth / 2 - e.pageX) / 50;
            const y = (window.innerHeight / 2 - e.pageY) / 50;
            avatarRef.current.style.transform = `translate(${x}px, ${y}px) rotate(${x / 2}deg)`;
        };

        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    // 聊天气泡状态
    const [bubbleVisible, setBubbleVisible] = useState(false);
    const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
    const [displayedText, setDisplayedText] = useState("");
    const [isTyping, setIsTyping] = useState(false);

    // 打字机效果
    const typeMessage = useCallback(async (messageIndex: number) => {
        const message = chatMessages[messageIndex];
        const fullText = message.text + message.highlight + message.suffix;

        setIsTyping(true);
        setBubbleVisible(true);
        setDisplayedText("");

        // 逐字显示
        for (let i = 0; i <= fullText.length; i++) {
            await new Promise(resolve => setTimeout(resolve, 50));
            setDisplayedText(fullText.slice(0, i));
        }

        setIsTyping(false);

        // 显示6秒后隐藏
        await new Promise(resolve => setTimeout(resolve, 6000));
        setBubbleVisible(false);

        // 等待淡出动画完成后切换到下一条消息
        await new Promise(resolve => setTimeout(resolve, 800));
        setCurrentMessageIndex((prev) => (prev + 1) % chatMessages.length);
    }, []);

    // 自动循环显示消息
    useEffect(() => {
        const timer = setTimeout(() => {
            typeMessage(currentMessageIndex);
        }, 1500);

        return () => clearTimeout(timer);
    }, [currentMessageIndex, typeMessage]);

    // 简单映射 pathname 到 currentPage，仅用于高亮和主导航判定
    // 如果路径是嵌套的（如 /products/123），可能需要 startsWith 逻辑
    // 这里暂时做精准匹配或一级匹配
    const currentPage = allNavItems.find(item => item.href === pathname || (item.href !== "/" && pathname.startsWith(item.href)))?.href || "/";

    // 根据当前页面获取主导航项和其他导航项
    const primaryNav = allNavItems.find(item => item.href === currentPage) || allNavItems[4]; // 默认为Home
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

    // 获取当前消息的高亮部分
    const currentMessage = chatMessages[currentMessageIndex];

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
                        className="fixed bottom-4 left-0 right-0 z-50 mx-auto w-full max-w-[95%] sm:bottom-6 sm:max-w-[90%] lg:bottom-8 lg:max-w-[1200px]"
                        role="banner"
                    >
                        <nav
                            className={cn(
                                "flex items-center justify-between",
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

                                return (
                                    <div className="hidden items-center gap-[25px] sm:flex">
                                        {/* 头像容器 - 溢出导航栏顶部 */}
                                        <div className="group relative">
                                            {/* 聊天气泡 - 自动显示打字机效果 */}
                                            <div
                                                className={cn(
                                                    "absolute bottom-[130px] left-0 min-w-[260px] max-w-[320px] rounded-[18px] border-2 border-black bg-white px-5 py-4 shadow-[8px_8px_0_rgba(0,0,0,0.05)] transition-all duration-400 ease-out pointer-events-none z-10",
                                                    bubbleVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
                                                )}
                                            >
                                                <p className="text-[14px] leading-[1.6] text-[#1a1a1a] tracking-[0.02em] whitespace-pre-line">
                                                    {displayedText.includes(currentMessage.highlight) && currentMessage.highlight ? (
                                                        <>
                                                            {displayedText.split(currentMessage.highlight)[0]}
                                                            <b className="font-bold text-black border-b-2 border-[#D4AF37]">{currentMessage.highlight}</b>
                                                            {displayedText.split(currentMessage.highlight)[1] || ""}
                                                        </>
                                                    ) : (
                                                        displayedText
                                                    )}
                                                    {isTyping && <span className="animate-pulse">|</span>}
                                                </p>
                                                {/* 气泡小三角 */}
                                                <div className="absolute bottom-[-10px] left-[35px] w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[10px] border-t-black" />
                                            </div>

                                            {/* 头像 - 视差 + 动效 */}
                                            <div
                                                ref={avatarRef}
                                                className="relative h-[110px] w-[110px] -mt-[55px]"
                                            >
                                                {/* 悬停缩放容器 */}
                                                <div className="relative h-full w-full transition-transform duration-500 ease-out group-hover:scale-105 group-hover:-translate-y-1">
                                                    {/* 外圈 - 白色半透明 - 慢速旋转 */}
                                                    <div className="absolute -inset-2 rounded-full border border-white/60 animate-[spin_10s_linear_infinite]" />

                                                    {/* 内圈 - 金色 - 快速反向旋转 - 裁剪 */}
                                                    <div
                                                        className="absolute -inset-1 rounded-full border-[1.5px] border-[#D4C9B5]"
                                                        style={{
                                                            clipPath: "polygon(0 0, 50% 0, 50% 50%, 0 50%)",
                                                            animation: "spin 4s linear infinite reverse"
                                                        }}
                                                    />

                                                    {/* 头像容器 */}
                                                    <div className="absolute inset-0 rounded-full bg-white p-[4px] shadow-[0_10px_30px_rgba(0,0,0,0.15)]">
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img
                                                            src="/images/xiaoni-avatar.png"
                                                            alt="小旎老师"
                                                            className="h-full w-full rounded-full object-cover"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* CTA信息 */}
                                        <div className="flex flex-col items-center gap-1">
                                            <span className="text-[20px] font-semibold text-black uppercase tracking-[2px]">
                                                在线测肤
                                            </span>
                                            <Link
                                                href={advisorItem.href}
                                                onClick={(e) => handleNavClick(advisorItem.href, e)}
                                                className="flex items-center gap-1.5 bg-black text-[#F0EDE1] rounded-[50px] px-4 py-1.5 text-[13px] font-medium transition-all duration-300 ease-out hover:text-[#F0EDE1] hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(0,0,0,0.3)]"
                                            >
                                                免费使用
                                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M5 12h14M12 5l7 7-7 7" />
                                                </svg>
                                            </Link>
                                        </div>
                                    </div>
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
                            <div className="hidden items-center gap-3 sm:flex sm:gap-[35px]">
                                {allNavItems.filter(item => item.href !== "/advisor").map((item) => {
                                    const Icon = item.icon;
                                    const isHome = item.href === "/";

                                    return (
                                        <>
                                            {/* 在首页前添加分割线 */}
                                            {isHome && (
                                                <div key="divider" className="h-10 w-px bg-black/20" />
                                            )}
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                onClick={(e) => handleNavClick(item.href, e)}
                                                className={cn(
                                                    "group flex flex-col items-center gap-1 py-2 text-[15px] font-medium text-[#1a1a1a] transition-all duration-[600ms] ease-[cubic-bezier(0.19,1,0.22,1)]",
                                                    "hover:opacity-70"
                                                )}
                                            >
                                                <Icon className="h-8 w-8 opacity-70 transition-all duration-[600ms] ease-[cubic-bezier(0.19,1,0.22,1)] group-hover:translate-y-[-2px] group-hover:opacity-100" />
                                                <span>
                                                    {item.label}
                                                </span>
                                            </Link>
                                        </>
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
