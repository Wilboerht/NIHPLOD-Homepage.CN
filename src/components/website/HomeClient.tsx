"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "next-view-transitions";
import Image from "next/image";
import { m } from "framer-motion";
import { ChevronDown } from "lucide-react";
import type { HomePageContent } from "@/types/page-content";
import { UserButton } from "./UserButton";
import { cn } from "@/lib/utils";
import { BottomNavBar } from "@/components/website";

interface HomeClientProps {
  content?: HomePageContent;
}

export default function HomeClient({ content: _content }: HomeClientProps) {
  const wave1Ref = useRef<SVGSVGElement>(null);
  const wave2Ref = useRef<SVGSVGElement>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  // 组件加载后自动展开 - 已移除，改为默认展开

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
    };

    document.addEventListener("mousemove", handleMouseMove);
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, [isExpanded]);

  return (
    <>
      {/* 底层暗金色背景 */}
      <div className="fullscreen-bg-base" />

      {/* 全屏背景图片 - 带边距和圆角 */}
      <div className="fullscreen-bg">
        <Image
          src="/images/bg.png"
          alt="Home Background"
          fill
          priority
          quality={75}
          sizes="100vw"
          className="object-cover"
        />
        {/* 毛玻璃遮罩层 - 展开时显示 */}
        <div
          className={cn(
            "absolute inset-0 bg-white/30 backdrop-blur-md transition-opacity duration-300",
            isExpanded ? "opacity-100" : "opacity-0"
          )}
          style={{ transitionDelay: isExpanded ? "400ms" : "0ms" }}
        />
      </div>

      {/* 内容区域容器 */}
      <m.div
        className="safe-area-content !top-0"
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* 主内容区域 + 展开按钮一体化 */}
        <m.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="h-full"
        >
          {/* 主内容区域 + 按钮一体化容器 */}
          <div className="flex h-full flex-col items-center">
            {/* 主内容区域 - 抽屉 */}
            <m.div
              className="relative w-full overflow-hidden rounded-b-2xl bg-[#F0EDE1] lg:rounded-b-3xl"
              initial={{ height: 0, flexGrow: 0 }}
              animate={{
                flexGrow: isExpanded ? 1 : 0,
                height: !isExpanded ? 0 : "auto"
              }}
              transition={{
                duration: 1,
                ease: [0.22, 1, 0.36, 1],
                delay: isExpanded ? 0.2 : 0
              }}
            >
              <div className="home-container relative h-full w-full">
                {/* 矿物纹理覆盖层 - 使用 base64 SVG 噪点 */}
                <div
                  className="mineral-texture absolute inset-0 z-0 opacity-50"
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

                {/* 右上角登录按钮 */}
                <div className="user-button-container relative z-20">
                  <UserButton />
                </div>

                {/* 主内容 - 添加底部padding以在视觉上居中(抵消底部absolute定位的元素) */}
                <main className="main-content relative z-10 flex h-full flex-col items-center justify-center text-center pb-32 lg:pb-24">
                  {/* Logo */}
                  <m.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1.2, delay: 0.4 }}
                  >
                    <Image
                      src="/images/logo.png"
                      alt="Dolphin Skin"
                      width={220}
                      height={80}
                      className="logo"
                      priority
                    />
                  </m.div>

                  {/* 品牌文案 */}
                  <m.div
                    className="content-wrapper mt-8 sm:mt-12"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1.2, delay: 0.6 }}
                  >
                    <h1 className="title text-base sm:text-lg lg:text-xl font-light leading-relaxed tracking-widest text-brand-charcoal">
                      <span>海豚的肌肤，拥有每两小时</span><br className="lg:hidden" />
                      <span>自我更新的神奇能力。</span><br />
                      <span>这种「逆转时光」的动物本能，</span><br className="lg:hidden" />
                      <span>是我们灵感的来源。</span>
                    </h1>
                  </m.div>

                  {/* 按钮组 */}
                  <m.div
                    className="button-group mt-10 sm:mt-16 flex gap-6"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1.2, delay: 0.8 }}
                  >
                    <Link href="/products" className="btn btn-primary">
                      探索更多
                    </Link>
                    <Link href="/advisor" className="btn btn-secondary">
                      AI快速测肤
                      <span className="badge-new">NEW</span>
                    </Link>
                  </m.div>

                  {/* 底部辅助导航与版权 */}
                  <m.div
                    className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 1.2, delay: 1 }}
                  >
                    {/* 辅助链接 */}
                    <div className="flex items-center gap-3 sm:gap-6">
                      {[
                        { href: "/services", label: "服务" },
                        { href: "/contact", label: "联系我们" },
                        { href: "/careers", label: "加入我们" },
                        { href: "/privacy", label: "隐私政策" },
                        { href: "/terms", label: "服务条款" },
                      ].map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          className="text-[10px] sm:text-[11px] uppercase tracking-wider text-brand-charcoal/60 transition-colors hover:text-brand-charcoal"
                        >
                          {link.label}
                        </Link>
                      ))}
                    </div>

                    {/* 版权文本 */}
                    <p className="text-[10px] font-light tracking-widest text-brand-charcoal/70">
                      &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
                    </p>
                  </m.div>
                </main>
              </div>
            </m.div>

            {/* 展开/收起按钮 */}
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="group -mt-[1px] relative z-10 flex items-center justify-center rounded-b-2xl bg-[#F0EDE1] px-10 py-3 shadow-sm transition-shadow hover:shadow-md lg:px-14 lg:py-3.5 overflow-hidden"
            >
              {/* 矿物纹理覆盖层 - 使用与抽屉相同的 texture-overlay 类 */}
              <div className="texture-overlay absolute inset-0" />
              <m.div
                className="relative z-10 flex flex-col items-center"
                animate={{ rotate: isExpanded ? 180 : 0 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              >
                <ChevronDown className="h-7 w-7 text-brand-gold lg:h-8 lg:w-8" />
                <ChevronDown className="-mt-5 h-7 w-7 text-brand-gold lg:h-8 lg:w-8" />
              </m.div>
            </button>
          </div>
        </m.div>
      </m.div>

      <BottomNavBar
        isExpanded={isExpanded}
        currentPage="/"
        ariaLabel="首页导航"
      />
    </>
  );
}
