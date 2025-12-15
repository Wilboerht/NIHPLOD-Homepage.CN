"use client";

import { useEffect, useState } from "react";
import { m, AnimatePresence } from "framer-motion";
import { Link } from "next-view-transitions";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronDown, Menu, X } from "lucide-react";
import { useAdvisorAnalytics } from "@/hooks/useAdvisorAnalytics";
import { cn } from "@/lib/utils";
import { ShopIcon, StoryIcon, RitualIcon, HomeIcon, ContactIcon } from "@/components/website";

/**
 * 底部导航项配置
 */
const bottomNavItems = [
  { href: "/products", label: "了解产品", labelEn: "Products", icon: ShopIcon },
  { href: "/story", label: "关于旎柏", labelEn: "Story", icon: StoryIcon },
  { href: "/ritual", label: "护肤仪式", labelEn: "Ritual", icon: RitualIcon },
];

/**
 * AI 护肤顾问欢迎页
 *
 * NIHPLOD 旎柏 - 源自摩纳哥的高端护肤品牌
 * 品牌理念：奢华、温馨、科技、纯净、仪式感
 *
 * 设计风格：大气、精致、清爽、简约不简单
 */
export function AdvisorWelcome() {
  const router = useRouter();
  const { initSession } = useAdvisorAnalytics();
  const [isExpanded, setIsExpanded] = useState(true); // 默认展开
  const [isNavMenuOpen, setIsNavMenuOpen] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    initSession();
  }, [initSession]);

  // 监听滚动
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleStart = () => {
    router.push("/advisor/questions");
  };

  return (
    <>
      {/* 全屏背景图片 */}
      <div className="fixed inset-0 z-0">
        <Image
          src="/images/bg.png"
          alt="AI 护肤顾问"
          fill
          priority
          quality={100}
          className="object-cover"
          sizes="100vw"
        />
        {/* 毛玻璃遮罩层 - 滚动或展开时显示 */}
        <div
          className={cn(
            "absolute inset-0 bg-white/30 backdrop-blur-md transition-opacity duration-300",
            isScrolled || isExpanded ? "opacity-100" : "opacity-0"
          )}
        />
      </div>

      {/* 主内容容器 */}
      <m.div
        className="fixed inset-0 z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{
          duration: 0.6,
          ease: [0.32, 0.72, 0, 1]
        }}
      >
        {/* 主内容区域 + 展开按钮一体化 */}
        <m.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{
            opacity: 1,
            scale: 1,
            bottom: isExpanded ? 16 : 0
          }}
          transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
          className="absolute left-6 right-6 top-0 z-20 sm:left-10 sm:right-10 lg:left-16 lg:right-16"
        >
          {/* 主内容区域 + 按钮一体化容器 */}
          <div className="flex h-full flex-col items-center">
            {/* 主内容区域 */}
            <m.div
              className="w-full overflow-hidden rounded-b-2xl bg-[#EBE8DB] lg:rounded-b-3xl"
              animate={{
                flexGrow: isExpanded ? 1 : 0,
                height: isExpanded ? "auto" : 0
              }}
              transition={{
                duration: 0.7,
                ease: [0.4, 0, 0.2, 1]
              }}
            >
              <div className={cn(
                "flex h-full flex-col overflow-y-auto px-6 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-12",
                "[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
              )}>
                {/* 内容区域 - 垂直居中 */}
                <div className="flex flex-1 flex-col items-center justify-center">
                  {/* 皇冠图标 */}
                  <m.div
                    className="text-brand-gold/50"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.1 }}
                  >
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M18.567 19.4336C19.0088 19.4337 19.3668 19.7926 19.3668 20.2344C19.3666 20.6759 19.0086 21.0341 18.567 21.0342H5.43323C4.99163 21.0341 4.6327 20.6759 4.63245 20.2344C4.63245 19.7926 4.99147 19.4337 5.43323 19.4336H18.567ZM11.9996 2.97266C12.2929 2.97266 12.5628 3.13298 12.7028 3.39062L15.6891 8.89258L20.4567 6.9707C20.7347 6.8586 21.0521 6.91146 21.2789 7.10742C21.5058 7.3035 21.6036 7.60999 21.5328 7.90137L19.3444 16.9199C19.2573 17.2786 18.9361 17.5312 18.567 17.5312H5.43323C5.06415 17.5312 4.74196 17.2786 4.65491 16.9199L2.46643 7.90137C2.39575 7.6101 2.49367 7.3035 2.72034 7.10742C2.94705 6.91145 3.26463 6.85881 3.5426 6.9707L8.3092 8.89258L11.2965 3.39062L11.3551 3.29883C11.5044 3.09548 11.7431 2.97277 11.9996 2.97266ZM11.9996 11.6572C11.0326 11.6573 10.2488 12.4412 10.2487 13.4082C10.2487 14.3753 11.0326 15.1591 11.9996 15.1592C12.9668 15.1592 13.7506 14.3754 13.7506 13.4082C13.7505 12.4412 12.9667 11.6572 11.9996 11.6572Z" fill="currentColor"/>
                    </svg>
                  </m.div>

                  {/* 装饰线条 */}
                  <m.div
                    className="mb-6 mt-4 h-px w-12 bg-gradient-to-r from-transparent via-brand-gold/50 to-transparent sm:mb-8 sm:w-16"
                    initial={{ scaleX: 0, opacity: 0 }}
                    animate={{ scaleX: 1, opacity: 1 }}
                    transition={{ duration: 1, delay: 0.2 }}
                  />

                  {/* 英文标题 */}
                  <m.p
                    className="text-[11px] font-light uppercase tracking-[0.3em] text-brand-gold/80 sm:text-xs"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.3 }}
                  >
                    AI Skin Advisor
                  </m.p>

                  {/* 中文主标题 */}
                  <m.h1
                    className="mt-4 text-center font-serif text-4xl font-light tracking-wide text-brand-charcoal sm:mt-5 sm:text-5xl md:text-6xl lg:text-7xl"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.4 }}
                  >
                    专属定制
                  </m.h1>

                  {/* 分隔装饰 */}
                  <m.div
                    className="my-6 flex items-center gap-3 sm:my-8"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.6 }}
                  >
                    <span className="h-px w-8 bg-brand-charcoal/20" />
                    <span className="h-1 w-1 rounded-full bg-brand-gold/60" />
                    <span className="h-px w-8 bg-brand-charcoal/20" />
                  </m.div>

                  {/* 副标题 */}
                  <m.p
                    className="max-w-sm text-center text-sm font-light leading-relaxed text-brand-charcoal/60 sm:max-w-md sm:text-base"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.7 }}
                  >
                    回答几个简单问题
                    <br className="sm:hidden" />
                    <span className="hidden sm:inline">，</span>
                    发现专属于你的护肤方案
                  </m.p>

                  {/* 开始按钮 */}
                  <m.button
                    onClick={handleStart}
                    className="mt-10 rounded-full border-2 border-brand-gold/70 bg-brand-gold/10 px-14 py-4 text-sm font-medium tracking-[0.2em] text-brand-charcoal shadow-sm backdrop-blur-sm transition-all duration-300 hover:border-brand-gold hover:bg-brand-gold/20 hover:shadow-md sm:mt-12 sm:px-16 sm:py-4.5 sm:text-base"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.9 }}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    开始测试
                  </m.button>

                  {/* 时间提示 + 花园入口 */}
                  <m.div
                    className="mt-5 flex items-center gap-3 sm:mt-6"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 1.1 }}
                  >
                    <span className="text-[11px] font-light tracking-wider text-brand-charcoal/40 sm:text-xs">
                      约 2 分钟 · 完全免费
                    </span>
                    <span className="text-brand-charcoal/20">|</span>
                    <Link
                      href="/lottery/garden"
                      className="group flex items-center gap-1 text-[11px] font-light tracking-wider text-brand-gold/70 transition-colors hover:text-brand-gold sm:text-xs"
                    >
                      <span>🌸</span>
                      <span>查看幸运花园</span>
                    </Link>
                  </m.div>

                  {/* 隐私说明 */}
                  <m.p
                    className="mt-4 max-w-xs text-center text-[10px] font-light leading-relaxed text-brand-charcoal/35 sm:max-w-sm sm:text-[11px]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 1.2 }}
                  >
                    面部图像仅由 AI 即时分析，不会以任何形式存储或保留
                  </m.p>

                  {/* Logo */}
                  <m.div
                    className="mt-8 sm:mt-10"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 1.3 }}
                  >
                    <Image
                      src="/images/logo.png"
                      alt="NIHPLOD"
                      width={120}
                      height={40}
                      className="h-8 w-auto opacity-40 sm:h-10"
                    />
                  </m.div>
                </div>
              </div>
            </m.div>

            {/* 展开/收起按钮 - 始终显示，紧贴内容区域 */}
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="group flex items-center justify-center rounded-b-2xl bg-[#EBE8DB] px-10 py-2.5 shadow-sm lg:px-14 lg:py-3"
            >
              <m.div
                className="flex flex-col items-center"
                animate={{
                  rotate: isExpanded ? 180 : 0,
                  scale: 1
                }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
              >
                <ChevronDown className="h-7 w-7 text-brand-gold lg:h-8 lg:w-8" />
                <ChevronDown className="-mt-5 h-7 w-7 text-brand-gold lg:h-8 lg:w-8" />
              </m.div>
            </button>
          </div>
        </m.div>
      </m.div>

      {/* 移动端菜单遮罩层 */}
      <AnimatePresence>
        {isNavMenuOpen && !isExpanded && (
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
        {isNavMenuOpen && !isExpanded && (
          <m.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="fixed bottom-20 right-3 z-50 w-44 rounded-2xl bg-white/95 p-2 shadow-xl backdrop-blur-md sm:hidden"
          >
            <div className="flex flex-col gap-1">
              {/* 首页 */}
              <Link
                href="/"
                onClick={() => setIsNavMenuOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors active:bg-brand-beige/50"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gold/10">
                  <HomeIcon className="h-5 w-5" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-brand-charcoal">首页</span>
                  <span className="font-serif text-[9px] uppercase tracking-wide text-brand-charcoal/50">Home</span>
                </div>
              </Link>
              {/* 其他导航项 */}
              {bottomNavItems.map((item) => {
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

      {/* 底部导航栏 - 展开时隐藏 */}
      <AnimatePresence>
        {!isExpanded && (
          <m.header
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{
              duration: 0.35,
              ease: [0.32, 0.72, 0, 1]
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
              aria-label="护肤顾问页导航"
            >
              {/* 左侧主导航 - 护肤顾问 */}
              <Link
                href="/advisor"
                className="group flex items-center gap-2 transition-opacity active:opacity-70 sm:gap-4 sm:hover:opacity-80"
              >
                {/* 图标容器 */}
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gold/10 sm:h-16 sm:w-16 lg:h-20 lg:w-20">
                  <ContactIcon className="h-6 w-6 sm:h-10 sm:w-10 lg:h-14 lg:w-14" />
                </div>
                {/* 文字 */}
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-brand-charcoal sm:text-lg lg:text-2xl">
                    护肤顾问
                  </span>
                  <span className="font-serif text-[10px] uppercase tracking-wide text-brand-gold/70 sm:text-xs lg:text-base">
                    Consultant
                  </span>
                </div>
              </Link>

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

              {/* 平板/桌面端：直接显示导航图标 */}
              <div className="hidden items-center gap-5 sm:flex lg:gap-8">
                {bottomNavItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="group flex flex-col items-center gap-1 transition-opacity hover:opacity-80"
                    >
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl transition-colors group-hover:bg-brand-beige/50 lg:h-16 lg:w-16">
                        <Icon className="h-8 w-8 lg:h-9 lg:w-9" />
                      </div>
                      <span className="text-xs text-brand-charcoal/70 lg:text-sm">
                        {item.label}
                      </span>
                      <span className="font-serif text-[10px] uppercase tracking-wide text-brand-charcoal/50 lg:text-xs">
                        {item.labelEn}
                      </span>
                    </Link>
                  );
                })}
                {/* 回到首页按钮 */}
                <Link
                  href="/"
                  className="group flex flex-col items-center gap-1 transition-opacity hover:opacity-80"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl transition-colors group-hover:bg-brand-beige/50 lg:h-16 lg:w-16">
                    <HomeIcon className="h-8 w-8 lg:h-9 lg:w-9" />
                  </div>
                  <span className="text-xs text-brand-charcoal/70 lg:text-sm">
                    首页
                  </span>
                  <span className="font-serif text-[10px] uppercase tracking-wide text-brand-charcoal/50 lg:text-xs">
                    Home
                  </span>
                </Link>
              </div>
            </nav>
          </m.header>
        )}
      </AnimatePresence>
    </>
  );
}
