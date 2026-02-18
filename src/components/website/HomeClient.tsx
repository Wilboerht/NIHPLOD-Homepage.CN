"use client";


import { useEffect, useRef, useState, Suspense } from "react";
import { Link } from "next-view-transitions";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { m, AnimatePresence } from "framer-motion";
import { ChevronDown, Menu, X } from "lucide-react";
import type { HomePageContent } from "@/types/page-content";
// import { UserButton } from "./UserButton";
import { cn } from "@/lib/utils";
import { useLayout } from "@/contexts/LayoutContext";
import { useAuth } from "@/contexts/AuthContext";

/**
 * 独立的 URL 参数处理器组件
 * 需要被包裹在 Suspense 中
 */
function ContactParamHandler() {
  const searchParams = useSearchParams();
  const { openContact } = useAuth();

  useEffect(() => {
    if (searchParams.get("contact") === "true") {
      openContact();
      // 清除 URL 参数
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, [searchParams, openContact]);

  return null;
}

/**
 * 移动端底部菜单组件
 * 点击 "更多" 按钮展开/收起链接列表
 * 使用绝对定位，展开时向上浮动，不影响其他元素布局
 */
function MobileFooterMenu({ links, onContactClick }: { links: { href: string; label: string }[], onContactClick: () => void }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="flex sm:hidden flex-col items-center mb-2 relative z-30">
      {/* 展开的链接列表 - 绝对定位，从按钮上方向上展开 */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* 背景遮罩 */}
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-20"
              onClick={() => setIsOpen(false)}
            />
            {/* 菜单面板 */}
            <m.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="absolute bottom-full mb-4 z-30 flex flex-col items-center overflow-hidden rounded-2xl border border-brand-beige/50 bg-[#F8F6F1]/95 shadow-xl backdrop-blur-md"
              style={{ minWidth: "160px" }}
            >
              {links.map((link, index) => {
                const isContact = link.href === "/contact";
                return isContact ? (
                  <button
                    key={link.href}
                    onClick={() => {
                      setIsOpen(false);
                      onContactClick();
                    }}
                    className={cn(
                      "w-full px-6 py-3 text-center text-sm tracking-wide text-brand-charcoal/80 transition-all hover:bg-brand-gold/10 hover:text-brand-charcoal",
                      index !== links.length - 1 && "border-b border-brand-beige/30"
                    )}
                  >
                    {link.label}
                  </button>
                ) : (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsOpen(false)}
                    className={cn(
                      "w-full px-6 py-3 text-center text-sm tracking-wide text-brand-charcoal/80 transition-all hover:bg-brand-gold/10 hover:text-brand-charcoal",
                      index !== links.length - 1 && "border-b border-brand-beige/30"
                    )}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </m.div>
          </>
        )}
      </AnimatePresence>

      {/* 菜单切换按钮 */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-1.5 rounded-full px-4 py-2 text-xs uppercase tracking-wider transition-all",
          isOpen
            ? "bg-brand-charcoal/10 text-brand-charcoal"
            : "text-brand-charcoal/60 hover:text-brand-charcoal"
        )}
      >
        {isOpen ? (
          <>
            <X className="h-3.5 w-3.5" />
            <span>收起</span>
          </>
        ) : (
          <>
            <Menu className="h-3.5 w-3.5" />
            <span>更多</span>
          </>
        )}
      </button>
    </div>
  );
}

const FOOTER_LINKS = [
  { href: "/terms", label: "服务条款" },
  { href: "/services", label: "服务入口" },
  { href: "/careers", label: "加入我们" },
  { href: "/contact", label: "联系我们" },
  { href: "/privacy", label: "隐私政策" },
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
  const { openContact } = useAuth();
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
        <ContactParamHandler />
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
          <div className="flex h-full flex-col items-center pointer-events-none">
            {/* 主内容区域 - 抽屉 - z-20 Ensure it sits on top of the button */}
            <m.div
              className="relative z-20 w-full overflow-hidden rounded-b-2xl bg-[#F0EDE1] lg:rounded-b-3xl pointer-events-auto"
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

                {/* 波浪背景 */}
                <div className="wave-container pointer-events-none absolute bottom-0 left-0 right-0 z-0">
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
                      src="/images/logo.webp"
                      alt="Dolphin Skin"
                      width={280}
                      height={100}
                      className="logo"
                      priority
                    />
                  </m.div>

                  {/* 品牌文案 - 逐行交错加载 */}
                  <m.div
                    className="content-wrapper mt-12 sm:mt-16"
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
                    <h1 className="title text-base sm:text-xl lg:text-2xl font-light leading-[2] tracking-[0.2em] text-brand-charcoal">
                      {[
                        "海豚的肌肤，拥有每两小时",
                        "自我更新的神奇能力",
                        "这种「逆转时光」的动物本能，",
                        "是我们灵感的来源"
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
                  </m.div>

                  {/* 按钮组 - 增加触压反馈 */}
                  <m.div
                    className="button-group mt-12 sm:mt-16 flex gap-6"
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
                      探索更多
                    </m.button>
                    <m.div whileTap={{ scale: 0.96 }} className="flex">
                      <Link href="https://advisor.nihplod.cn" className="btn btn-secondary">
                        AI快速测肤
                        <span className="badge-new">NEW</span>
                      </Link>
                    </m.div>
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
                    <div className="hidden sm:flex items-center gap-3 sm:gap-6">
                      {FOOTER_LINKS.map((link) => {
                        if (link.href === "/contact") {
                          return (
                            <button
                              key={link.href}
                              onClick={() => openContact()}
                              className="text-xs uppercase tracking-wider text-brand-charcoal/60 transition-colors hover:text-brand-charcoal"
                            >
                              {link.label}
                            </button>
                          );
                        }
                        return (
                          <Link
                            key={link.href}
                            href={link.href}
                            className="text-xs uppercase tracking-wider text-brand-charcoal/60 transition-colors hover:text-brand-charcoal"
                          >
                            {link.label}
                          </Link>
                        );
                      })}
                    </div>

                    {/* 辅助链接 - 移动端 (可折叠菜单) */}
                    <MobileFooterMenu links={FOOTER_LINKS} onContactClick={() => openContact()} />

                    {/* 版权文本 */}
                    <p className="text-xs font-light tracking-widest text-brand-charcoal/60 relative z-10">
                      &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
                    </p>
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
              className="group -mt-[1px] relative z-10 flex items-center justify-center rounded-b-2xl bg-[#F0EDE1] px-10 py-3 shadow-sm transition-shadow hover:shadow-md lg:px-14 lg:py-3.5 overflow-hidden pointer-events-auto"
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
