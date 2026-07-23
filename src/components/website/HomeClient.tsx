"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { createPortal } from "react-dom";
import { Link } from "next-view-transitions";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import { m, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import type { HomePageContent } from "@/types/page-content";
// import { UserButton } from "./UserButton";
import { cn } from "@/lib/utils";
import { useLayout } from "@/contexts/LayoutContext";
import { useAuth } from "@/contexts/AuthContext";
import { DrawerPageContainer } from "@/components/ui/DrawerPageContainer";

/**
 * 独立的 URL 参数处理器组件
 * 需要被包裹在 Suspense 中
 */
function UrlParamHandler() {
  const searchParams = useSearchParams();
  const { openWechatBindModal } = useAuth();

  useEffect(() => {
    if (searchParams.get("login") === "wechat_bind") {
      openWechatBindModal();
      const newUrl = window.location.pathname;
      window.history.replaceState({}, "", newUrl);
    }
  }, [searchParams, openWechatBindModal]);

  return null;
}

/**
 * 移动端底部菜单组件 - 仪式感全屏抽屉版
 * 点击 "更多" 开启沉浸式服务导航层
 */
function MobileFooterMenu({
  links,
  onExploreClick,
}: {
  links: { href: string; label: string }[];
  onExploreClick: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 全屏菜单打开时的模态行为：Esc 关闭、锁定背景滚动、背景 inert、焦点移入/还原
  useEffect(() => {
    if (!isOpen) return;
    const menuEl = menuRef.current;
    if (!menuEl) return;

    const previousFocus = document.activeElement as HTMLElement | null;

    // 背景内容设为 inert，避免读屏器和键盘访问菜单背后的内容
    const backgroundElements = Array.from(document.body.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el !== menuEl
    );
    backgroundElements.forEach((el) => {
      el.inert = true;
    });

    // 锁定背景滚动
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    // 焦点移入菜单（关闭按钮）
    closeButtonRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      backgroundElements.forEach((el) => {
        el.inert = false;
      });
      if (previousFocus && previousFocus !== document.body) {
        previousFocus.focus();
      }
    };
  }, [isOpen]);

  return (
    <div className="pointer-events-auto relative mb-2 flex flex-col items-center md:hidden">
      {mounted &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <m.div
                key="mobile-full-menu"
                ref={menuRef}
                role="dialog"
                aria-modal="true"
                aria-label="更多导航"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="pointer-events-auto fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#FBF8F0]/95 backdrop-blur-xl"
              >
                {/* 顶层背景纹理 */}
                <div
                  className="texture-overlay pointer-events-none absolute inset-0 opacity-[0.03]"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                  }}
                />

                {/* 点击背景关闭 */}
                <div className="absolute inset-0 z-0" onClick={() => setIsOpen(false)} />

                {/* 菜单内容 + 关闭按钮 整体垂直居中 */}
                <div className="relative z-10 flex flex-col items-center gap-12">
                  {/* 链接列表 */}
                  <m.div
                    className="flex flex-col items-center gap-10"
                    initial="hidden"
                    animate="visible"
                    variants={{
                      visible: {
                        transition: { staggerChildren: 0.1 },
                      },
                    }}
                  >
                    {/* === 新增：主导航项 === */}
                    <m.div
                      variants={{
                        hidden: { opacity: 0, y: 30 },
                        visible: {
                          opacity: 1,
                          y: 0,
                          transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] },
                        },
                      }}
                    >
                      <button
                        onClick={() => {
                          setIsOpen(false);
                          onExploreClick();
                        }}
                        className="group mb-4 flex flex-col items-center gap-2"
                      >
                        <span className="text-2xl tracking-[0.3em] text-[#4A6272] transition-all group-hover:scale-105">
                          探索更多
                        </span>
                        <div className="h-px w-12 bg-[#4A6272]/30 transition-all duration-500 group-hover:w-20" />
                      </button>
                    </m.div>

                    {/* 次要链接 */}
                    {links.map((link) => (
                      <m.div
                        key={link.href}
                        variants={{
                          hidden: { opacity: 0, y: 30 },
                          visible: {
                            opacity: 1,
                            y: 0,
                            transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] },
                          },
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
                          <div className="h-px w-0 bg-brand-primary/40 transition-all duration-500 group-hover:w-full" />
                        </button>
                      </m.div>
                    ))}
                  </m.div>

                  {/* 关闭按钮 */}
                  <m.button
                    ref={closeButtonRef}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    onClick={() => {
                      setIsOpen(false);
                    }}
                    aria-label="关闭菜单"
                    className="group pointer-events-auto flex flex-col items-center"
                  >
                    <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-brand-charcoal/10 bg-white/5 transition-all hover:bg-white/20">
                      <X
                        className="h-7 w-7 text-brand-charcoal/30 group-hover:text-brand-charcoal"
                        strokeWidth={1}
                      />
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
        className="pointer-events-auto relative z-[30] flex min-h-0 min-w-0 cursor-pointer flex-col items-center gap-2 text-xs uppercase tracking-[0.25em] text-brand-charcoal/40 transition-all hover:text-brand-charcoal/70"
      >
        <span>更多</span>
        <div className="h-px w-5 bg-current opacity-40" />
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
  const textureRef = useRef<HTMLDivElement>(null);
  const { isDrawerOpen, setDrawerOpen, setNavMenuOpen } = useLayout();

  // 鼠标视差效果
  useEffect(() => {
    // 移动端禁用鼠标视差
    if (typeof window !== "undefined" && window.innerWidth <= 768) return;

    let rafId = 0;
    let pendingEvent: MouseEvent | null = null;

    const applyParallax = () => {
      rafId = 0;
      if (!pendingEvent) return;

      const moveX = (pendingEvent.clientX - window.innerWidth / 2) * 0.01;
      const moveY = (pendingEvent.clientY - window.innerHeight / 2) * 0.01;

      if (textureRef.current) {
        textureRef.current.style.transform = `translate(${moveX * 0.5}px, ${moveY * 0.5}px)`;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDrawerOpen) return;

      // rAF 节流：每帧最多应用一次视差，避免高频 mousemove 造成多余 style recalc
      pendingEvent = e;
      if (!rafId) {
        rafId = requestAnimationFrame(applyParallax);
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isDrawerOpen]);

  const handleCollapse = () => {
    setDrawerOpen(false);
    setNavMenuOpen(true);
  };

  return (
    <>
      <Suspense fallback={null}>
        <UrlParamHandler />
      </Suspense>

      <DrawerPageContainer defaultExpanded shadowOpacity={0.15} onCollapse={handleCollapse}>
        <div
          className={cn(
            "home-container relative h-full w-full transition-opacity duration-300",
            isDrawerOpen ? "opacity-100 delay-300" : "pointer-events-none opacity-0"
          )}
        >
          {/* 矿物纹理覆盖层 - 支持微弱视差 */}
          <div
            ref={textureRef}
            className="mineral-texture absolute -inset-10 z-0 transition-transform duration-1000 ease-out"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            }}
          />

          {/* 装饰线条 - 已移除 */}

          {/* 波浪背景 - 仅桌面端渲染，CSS 浮动动画 */}
          <div className="wave-container pointer-events-none absolute bottom-0 left-0 right-0 z-0 hidden lg:block">
            <svg className="wave wave-1" viewBox="0 0 1200 120" preserveAspectRatio="none">
              <path d="M0,60 C150,110 350,10 500,60 C650,110 850,10 1000,60 C1150,110 1350,10 1500,60" />
            </svg>
            <svg className="wave wave-2" viewBox="0 0 1200 120" preserveAspectRatio="none">
              <path d="M0,40 C200,90 400,0 600,40 C800,80 1000,0 1200,40" />
            </svg>
          </div>

          {/* 右上角登录按钮 - 暂时隐藏 */}
          {/* <div className="user-button-container relative z-20">
                  <UserButton />
                </div> */}

          {/* 主内容 - 上/中/下三分区（全局布局已提供 <main>，此处使用 div 避免嵌套 main 地标） */}
          <div className="main-content relative z-10 flex min-h-full flex-col justify-between px-6 py-8 text-center lg:py-12">
            {/* 中区：Logo + 文案 + CTA + 移动端服务菜单 */}
            <div className="flex flex-1 flex-col items-center justify-center gap-10 md:gap-14">
              {/* Logo */}
              <m.div
                className="flex flex-col items-center"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1.2, delay: 0.4 }}
              >
                <Image
                  src="/images/NIHPLOD-logo.svg"
                  alt="NIHPLOD 旎柏 Logo"
                  width={200}
                  height={72}
                  className="logo"
                  priority
                />
              </m.div>

              {/* 品牌文案 - 统一语义，响应式切换行数 */}
              <div className="content-wrapper">
                <h1 className="title">
                  <m.span
                    className="block"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 1.2,
                      delay: 0.6,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                  >
                    海豚的肌肤，拥有每两小时
                    <br className="md:hidden" />
                    自我更新的神奇能力，
                    <br className="hidden md:block" />
                    <br className="md:hidden" />
                    这种「逆转时光」的动物本能，
                    <br className="md:hidden" />
                    是我们灵感的来源。
                  </m.span>
                </h1>
              </div>

              {/* 按钮组 - 增加触压反馈 */}
              <m.div
                className="button-group flex"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1.2, delay: 1.2 }}
              >
                <m.button
                  type="button"
                  onClick={handleCollapse}
                  whileTap={{ scale: 0.96 }}
                  className="home-explore-btn group min-h-0 min-w-0 px-8"
                >
                  <span className="tracking-[0.15em]">探索旎柏</span>
                </m.button>
                <m.a
                  href="https://advisor.nihplod.cn"
                  target="_blank"
                  rel="noopener noreferrer"
                  whileTap={{ scale: 0.98 }}
                  className="home-text-link"
                >
                  肌智派测肤礼遇
                </m.a>
              </m.div>

              {/* 移动端辅助导航 - 上移到 CTA 下方，单手操作更友好 */}
              <div className="md:hidden">
                <MobileFooterMenu links={FOOTER_LINKS} onExploreClick={handleCollapse} />
              </div>
            </div>

            {/* 下区：桌面端 footer 链接 + 版权信息 */}
            <m.div
              className="relative flex flex-col items-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.2, delay: 1 }}
            >
              <div className="flex w-full flex-col items-center gap-3 py-3">
                {/* 辅助链接 - 桌面端 (静态列表) */}
                <div className="footer-links hidden items-center gap-6 md:flex">
                  {FOOTER_LINKS.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="inline-flex items-center transition-colors hover:text-brand-charcoal"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>

                {/* 版权文本 & 备案信息 */}
                <footer className="home-footer">
                  <p className="footer-copyright relative z-10">
                    &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
                  </p>
                  <div className="footer-beian">
                    <Link
                      href="https://beian.miit.gov.cn/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex !min-h-0 !min-w-0 items-center transition-colors hover:text-brand-primary"
                    >
                      沪ICP备2026014764号-1
                    </Link>
                    <span className="text-brand-charcoal/20" aria-hidden="true">
                      |
                    </span>
                    <Link
                      href="http://www.beian.gov.cn/portal/registerSystemInfo"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex !min-h-0 !min-w-0 items-center gap-1 transition-colors hover:text-brand-primary"
                    >
                      <Image
                        src="/images/beian.webp"
                        alt=""
                        width={12}
                        height={12}
                        className="shrink-0 opacity-80"
                      />
                      <span>沪公网安备31010702010178号</span>
                    </Link>
                  </div>
                </footer>
              </div>
            </m.div>
          </div>
        </div>
      </DrawerPageContainer>

      {/* 动态背景图片 - 移至最底层，位于 safe-area-content 之外或作为其第一层 */}

      {/* 底部导航栏 - 全局 Layout 中已包含，此处移除 */}
    </>
  );
}
