"use client";


import { useEffect, useRef, useState, Suspense } from "react";
import { createPortal } from "react-dom";
import { Link } from "next-view-transitions";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import { m, AnimatePresence } from "framer-motion";
import { ChevronDown, X } from "lucide-react";
import type { HomePageContent } from "@/types/page-content";
// import { UserButton } from "./UserButton";
import { cn } from "@/lib/utils";
import { useLayout } from "@/contexts/LayoutContext";
import { useAuth } from "@/contexts/AuthContext";

/**
 * 独立的 URL 参数处理器组件
 * 需要被包裹在 Suspense 中
 */
function UrlParamHandler() {
  const searchParams = useSearchParams();
  const { openContact, openWechatBindModal } = useAuth();

  useEffect(() => {
    let shouldClearUrl = false;

    if (searchParams.get("contact") === "true") {
      openContact();
      shouldClearUrl = true;
    }

    if (searchParams.get("login") === "wechat_bind") {
      openWechatBindModal();
      shouldClearUrl = true;
    }

    if (shouldClearUrl) {
      // 清除 URL 参数
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, [searchParams, openContact, openWechatBindModal]);

  return null;
}

/**
 * 移动端底部菜单组件 - 仪式感全屏抽屉版
 * 点击 "更多" 开启沉浸式服务导航层
 */
function MobileFooterMenu({ links, onExploreClick }: { links: { href: string; label: string }[], onExploreClick: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="flex md:hidden flex-col items-center mb-2 relative pointer-events-auto">
      {mounted && createPortal(
        <AnimatePresence>
          {isOpen && (
            <m.div
              key="mobile-full-menu"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#F8F7F3]/95 backdrop-blur-xl pointer-events-auto"
            >
              {/* 顶层背景纹理 */}
              <div
                className="texture-overlay absolute inset-0 opacity-[0.03] pointer-events-none"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
                }}
              />

              {/* 点击背景关闭 */}
              <div
                className="absolute inset-0 z-0"
                onClick={() => setIsOpen(false)}
              />

              {/* 菜单内容 + 关闭按钮 整体垂直居中 */}
              <div className="relative z-10 flex flex-col items-center gap-12">
                {/* 链接列表 */}
                <m.div
                  className="flex flex-col items-center gap-10"
                  initial="hidden"
                  animate="visible"
                  variants={{
                    visible: {
                      transition: { staggerChildren: 0.1 }
                    }
                  }}
                >
                  {/* === 新增：主导航项 === */}
                  <m.div
                    variants={{
                      hidden: { opacity: 0, y: 30 },
                      visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } }
                    }}
                  >
                    <button
                      onClick={() => {
                        setIsOpen(false);
                        onExploreClick();
                      }}
                      className="group flex flex-col items-center gap-2 mb-4"
                    >
                      <span className="text-2xl font-serif tracking-[0.3em] text-[#8B7355] transition-all group-hover:scale-105">
                        探索更多
                      </span>
                      <div className="h-px w-12 bg-[#8B7355]/30 group-hover:w-20 transition-all duration-500" />
                    </button>
                  </m.div>

                  {/* 次要链接 */}
                  {links.map((link) => (
                    <m.div
                      key={link.href}
                      variants={{
                        hidden: { opacity: 0, y: 30 },
                        visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } }
                      }}
                    >
                      <button
                        onClick={() => {
                          setIsOpen(false);
                          router.push(link.href);
                        }}
                        className="group flex flex-col items-center gap-2"
                      >
                        <span className="text-lg font-light tracking-[0.2em] text-brand-charcoal/80 transition-colors group-hover:text-brand-charcoal">
                          {link.label}
                        </span>
                        <div className="h-px w-0 bg-brand-gold/40 transition-all duration-500 group-hover:w-full" />
                      </button>
                    </m.div>
                  ))}
                </m.div>

                {/* 关闭按钮 */}
                <m.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  onClick={() => {
                    setIsOpen(false);
                  }}
                  className="flex flex-col items-center group pointer-events-auto"
                >
                  <div className="relative h-14 w-14 flex items-center justify-center rounded-full border border-brand-charcoal/10 bg-white/5 transition-all hover:bg-white/20">
                    <X className="h-7 w-7 text-brand-charcoal/30 group-hover:text-brand-charcoal" strokeWidth={1} />
                  </div>
                </m.button>
              </div>
            </m.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      <m.button
        type="button"
        onClick={() => setIsOpen(true)}
        whileTap={{ scale: 0.95 }}
        className="flex items-center gap-2 min-h-0 min-w-0 text-xs uppercase tracking-[0.2em] text-brand-charcoal/60 hover:text-brand-charcoal transition-all pointer-events-auto cursor-pointer relative z-[30]"
      >
        <div className="flex flex-col gap-1">
          <div className="h-px w-4 bg-current opacity-40" />
          <div className="h-px w-2 bg-current opacity-40 ml-auto" />
        </div>
        <span>更多</span>
      </m.button>
    </div>
  );
}

const FOOTER_LINKS = [
  { href: "/services", label: "服务入口" },
  { href: "/terms", label: "服务条款" },
  { href: "/privacy", label: "隐私政策" },
  { href: "/careers", label: "加入我们" },
  { href: "/contact", label: "联系我们" },
];

interface HomeClientProps {
  content?: HomePageContent;
}

export default function HomeClient({ content: _content }: HomeClientProps) {
  const wave1Ref = useRef<SVGSVGElement>(null);
  const wave2Ref = useRef<SVGSVGElement>(null);
  const textureRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(true); // 首页默认展开
  const { isDrawerOpen, setDrawerOpen, setNavMenuOpen } = useLayout();
  // const { openContact } = useAuth();
  // const router = useRouter();

  // 首页特殊处理：立即设置抽屉为展开状态，不需要动画
  useEffect(() => {
    setDrawerOpen(true);
  }, [setDrawerOpen]);

  // 监听 LayoutContext 中的 isDrawerOpen 变化，同步本地 isExpanded 状态
  // 解决：点击底部导航栏时，setDrawerOpen(true) 不会触发本地状态更新的问题
  useEffect(() => {
    if (isDrawerOpen && !isExpanded) {
      setIsExpanded(true);
    } else if (!isDrawerOpen && isExpanded) {
      setIsExpanded(false);
    }
  }, [isDrawerOpen, isExpanded]);

  // 鼠标视差效果
  useEffect(() => {
    // 移动端禁用鼠标视差
    if (typeof window !== 'undefined' && window.innerWidth <= 768) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isExpanded) return; // 只在展开时启用视差

      const moveX = (e.clientX - window.innerWidth / 2) * 0.01;
      const moveY = (e.clientY - window.innerHeight / 2) * 0.01;

      if (wave1Ref.current) {
        wave1Ref.current.style.transform = `translate(${moveX}px, ${moveY}px)`;
      }
      if (wave2Ref.current) {
        wave2Ref.current.style.transform = `translate(${-moveX}px, ${-moveY}px)`;
      }
      if (textureRef.current) {
        // 纹理视差更弱一点
        textureRef.current.style.transform = `translate(${moveX * 0.5}px, ${moveY * 0.5}px)`;
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, [isExpanded]);

  const handleCollapse = () => {
    setIsExpanded(false);
    setDrawerOpen(false);
    // 展开底部导航菜单
    setNavMenuOpen(true);
  };

  return (
    <>
      <Suspense fallback={null}>
        <UrlParamHandler />
      </Suspense>

      {/* 内容区域容器 */}
      <m.div
        className="safe-area-content !-top-[1px] !pointer-events-none"
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* 主内容区域 + 展开按钮一体化 */}
        <m.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="h-full pointer-events-none"
        >
          {/* 主内容区域 + 按钮一体化容器 */}
          <div className="flex h-full flex-col items-center pointer-events-none drop-shadow-[4px_2px_1px_rgba(123,114,108,0.2)]">
            {/* 主内容区域 - 抽屉 - z-20 Ensure it sits on top of the button */}
            <m.div
              className="relative z-20 w-full overflow-hidden rounded-b-2xl bg-[#F8F7F3] lg:rounded-b-3xl pointer-events-auto"
              style={{ willChange: "flex-grow, height" }}
              initial={{ height: 0, flexGrow: 0 }}
              animate={{
                flexGrow: isExpanded ? 1 : 0,
                height: !isExpanded ? 0 : "auto"
              }}
              transition={{
                duration: 1.2,
                ease: [0.22, 1, 0.36, 1],
                delay: isExpanded ? 0.3 : 0
              }}
            >
              <div className={cn("home-container relative h-full w-full transition-opacity duration-300", isExpanded ? "opacity-100 delay-300" : "opacity-0 pointer-events-none")}>
                {/* 矿物纹理覆盖层 - 支持微弱视差 */}
                <div
                  ref={textureRef}
                  className="mineral-texture absolute -inset-10 z-0 opacity-40 transition-transform duration-1000 ease-out"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
                  }}
                />



                {/* 装饰线条 - 已移除 */}

                {/* 波浪背景 - 仅桌面端渲染 */}
                <div className="wave-container pointer-events-none absolute bottom-0 left-0 right-0 z-0 hidden lg:block">
                  <svg ref={wave1Ref} className="wave wave-1" viewBox="0 0 1200 120" preserveAspectRatio="none">
                    <path d="M0,60 C150,110 350,10 500,60 C650,110 850,10 1000,60 C1150,110 1350,10 1500,60" />
                  </svg>
                  <svg ref={wave2Ref} className="wave wave-2" viewBox="0 0 1200 120" preserveAspectRatio="none">
                    <path d="M0,40 C200,90 400,0 600,40 C800,80 1000,0 1200,40" />
                  </svg>
                </div>

                {/* 右上角登录按钮 - 暂时隐藏 */}
                {/* <div className="user-button-container relative z-20">
                  <UserButton />
                </div> */}

                {/* 主内容 - 添加底部padding以在视觉上居中(抵消底部absolute定位的元素) */}
                <main className="main-content relative z-10 flex h-full flex-col items-center justify-center text-center pb-32 lg:pb-24">
                  {/* Logo */}
                  <m.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1.2, delay: 0.4 }}
                  >
                    <Image
                      src="/images/NIHPLOD-logo.svg"
                      alt="NIHPLOD 旎柏官方网站"
                      width={200}
                      height={72}
                      className="logo"
                      priority
                    />
                  </m.div>

                  {/* 品牌文案 - 针对不同设备切换 2行/4行 */}
                  <m.div
                    className="content-wrapper mt-16 md:mt-20"
                    initial="hidden"
                    animate="visible"
                    variants={{
                      visible: {
                        transition: {
                          staggerChildren: 0.3,
                          delayChildren: 0.6
                        }
                      }
                    }}
                  >
                    {/* 桌面端 & iPad Air/Pro (2行) - 字号提升至 22px */}
                    <h1 className="title hidden min-[820px]:block text-[22px] lg:text-2xl font-light leading-[2.2] tracking-[0.25em] text-brand-charcoal">
                      {[
                        "海豚的肌肤，拥有每两小时自我更新的神奇能力，",
                        "这种「逆转时光」的动物本能，是我们灵感的来源。"
                      ].map((line, i) => (
                        <m.span
                          key={i}
                          className="block"
                          variants={{
                            hidden: { opacity: 0, y: 15 },
                            visible: {
                              opacity: 1,
                              y: 0,
                              transition: { duration: 1.2, ease: [0.16, 1, 0.3, 1] }
                            }
                          }}
                        >
                          {line}
                        </m.span>
                      ))}
                    </h1>

                    {/* 移动端 & iPad mini (4行) - 字号从 base 提升至 lg */}
                    <h2 className="title block min-[820px]:hidden text-lg font-light leading-[2.1] text-brand-charcoal">
                      {[
                        "海豚的肌肤，拥有每两小时",
                        "自我更新的神奇能力，",
                        "这种「逆转时光」的动物本能，",
                        "是我们灵感的来源。"
                      ].map((line, i) => (
                        <m.span
                          key={i}
                          className="block"
                          variants={{
                            hidden: { opacity: 0, y: 15 },
                            visible: {
                              opacity: 1,
                              y: 0,
                              transition: { duration: 1.2, ease: [0.16, 1, 0.3, 1] }
                            }
                          }}
                        >
                          {line}
                        </m.span>
                      ))}
                    </h2>
                  </m.div>

                  {/* 按钮组 - 增加触压反馈 */}
                  <m.div
                    className="button-group mt-[70px] md:mt-24 flex gap-6"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1.2, delay: 1.2 }}
                  >
                    <m.button
                      type="button"
                      onClick={handleCollapse}
                      whileTap={{ scale: 0.96 }}
                      className="btn btn-primary"
                    >
                      探索旎柏
                    </m.button>
                    {/* <m.div whileTap={{ scale: 0.96 }} className="flex">
                      <Link href="https://advisor.nihplod.cn" className="btn btn-secondary">
                        AI快速测肤
                        <span className="badge-new">NEW</span>
                      </Link>
                    </m.div> */}
                  </m.div>

                  {/* 底部辅助导航与版权 */}
                  <m.div
                    className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 1.2, delay: 1 }}
                  >
                    {/* 辅助链接 */}
                    {/* 辅助链接 - 桌面端 (静态列表) */}
                    <div className="hidden md:flex items-center gap-3 sm:gap-6">
                      {FOOTER_LINKS.map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          className="inline-flex items-center text-xs uppercase tracking-wider text-brand-charcoal/60 transition-colors hover:text-brand-charcoal"
                        >
                          {link.label}
                        </Link>
                      ))}
                    </div>

                    {/* 辅助链接 - 移动端 (可折叠菜单) */}
                    <MobileFooterMenu
                      links={FOOTER_LINKS}
                      onExploreClick={handleCollapse}
                    />

                    {/* 版权文本 & 备案信息 */}
                    <div className="flex flex-col items-center gap-1 opacity-40">
                      <p className="text-[10px] sm:text-[11px] font-light tracking-widest text-brand-charcoal relative z-10 leading-tight">
                        &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
                      </p>
                      <div className="flex items-center justify-center gap-2 sm:gap-4 text-[9px] sm:text-[10px] font-light tracking-normal sm:tracking-widest text-brand-charcoal whitespace-nowrap flex-nowrap leading-tight">
                        <Link href="https://beian.miit.gov.cn/" target="_blank" className="!min-h-0 !min-w-0 hover:text-brand-gold transition-colors flex items-center">
                          沪ICP备2026014764号-1
                        </Link>
                        <span className="text-brand-charcoal/30">|</span>
                        <Link href="http://www.beian.gov.cn/portal/registerSystemInfo" target="_blank" className="!min-h-0 !min-w-0 hover:text-brand-gold transition-colors flex items-center gap-1">
                          <Image src="/images/beian.webp" alt="公安部备案图标" width={12} height={12} className="shrink-0 opacity-80" />
                          <span>沪公网安备31010702010178号</span>
                        </Link>
                      </div>
                    </div>
                  </m.div>
                </main>
              </div>
            </m.div>

            {/* 展开/收起按钮 */}
            <button
              onClick={() => {
                const newState = !isExpanded;
                setIsExpanded(newState);
                setDrawerOpen(newState);
              }}
              className="group -mt-[1px] relative z-30 flex items-center justify-center rounded-b-2xl bg-[#F8F7F3] px-10 py-3 lg:px-14 lg:py-3.5 overflow-hidden pointer-events-auto"
            >
              {/* 矿物纹理覆盖层 - 使用与抽屉相同的 texture-overlay 类 */}
              <div className="texture-overlay absolute inset-0" />
              <m.div
                className="relative z-10 flex flex-col items-center"
                animate={{ rotate: isExpanded ? 180 : 0, scale: 1 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              >
                <ChevronDown className="h-7 w-7 text-brand-gold lg:h-8 lg:w-8" />
                <ChevronDown className="-mt-5 h-7 w-7 text-brand-gold lg:h-8 lg:w-8" />
              </m.div>
            </button>
          </div>
        </m.div >
      </m.div >

      {/* 动态背景图片 - 移至最底层，位于 safe-area-content 之外或作为其第一层 */}


      {/* 底部导航栏 - 全局 Layout 中已包含，此处移除 */}
    </>
  );
}
