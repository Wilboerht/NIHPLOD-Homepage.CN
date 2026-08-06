"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "next-view-transitions";
import { ChevronRight } from "lucide-react";

/**
 * Kinetic Grid 全局背景组件
 *
 * 特点：
 * - 米白背景 (#EBE5D8) + 微点阵图案
 * - Bento Grid 便当盒卡片布局（左侧大卡片 + 右侧3x2小卡片）
 */
export function KineticBackground() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { user, redirectToLogin, openUserCenter } = useAuth();

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    let rafId: number;
    let timeoutId: ReturnType<typeof setTimeout>;

    const updateHeight = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const vv = window.visualViewport;
        if (vv) {
          wrapper.style.height = `${vv.height}px`;
        }
      });
    };

    const debouncedUpdateHeight = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(updateHeight, 100);
    };

    updateHeight();
    window.visualViewport?.addEventListener("resize", debouncedUpdateHeight);
    return () => {
      clearTimeout(timeoutId);
      cancelAnimationFrame(rafId);
      window.visualViewport?.removeEventListener("resize", debouncedUpdateHeight);
    };
  }, []);

  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1280px)");
    setIsDesktop(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const handleLoginClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      redirectToLogin();
    },
    [redirectToLogin],
  );

  return (
    <div ref={wrapperRef} className="kinetic-background-wrapper">
      <div className="kinetic-bg-base" />
      <div className="kinetic-dot-pattern" />
      <div className="kinetic-watermark">
        {/* PC 端水印（≥820px 断点切换见 globals.css，与便当盒移动端断点对齐） */}
        <div
          className="kinetic-watermark-pc relative"
          style={{ filter: "brightness(0) invert(0.95)", opacity: 0.22 }}
        >
          <Image
            src="/images/N-web.svg"
            alt="NIHPLOD 品牌水印"
            width={2800}
            height={800}
            style={{ objectFit: "contain" }}
            unoptimized
          />
        </div>
        {/* 移动端水印 - 竖版，深色水印在浅色背景上形成品牌纹理 */}
        <div
          className="kinetic-watermark-mobile absolute inset-0"
          style={{ filter: "brightness(0)" }}
        >
          <Image
            src="/images/watermark-mobile.webp"
            alt="NIHPLOD 品牌水印"
            fill
            style={{ objectFit: "cover" }}
          />
        </div>
      </div>

      <div className="kinetic-container">
        <Link href="/" className="kinetic-logo">
          <Image
            src="/images/NIHPLOD-logo.svg"
            alt="NIHPLOD"
            width={160}
            height={40}
            className="kinetic-logo-image"
            priority
          />
        </Link>

        {/* 左侧大卡片 - 跨两行 */}
        <div className="kinetic-cell kinetic-cell-large kinetic-image-cell kinetic-cell-boxes no-hover-effect group relative cursor-pointer">
          <Link href="/products" className="absolute inset-0 z-20" aria-label="了解产品" />
          <Image
            src="/images/kinetic-product-hero.webp"
            alt="NIHPLOD 产品系列"
            fill
            className="kinetic-cell-image"
            style={{ objectPosition: "center 30%" }}
            sizes="(max-width: 819px) 43vw, 30vw"
          />
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[#D4C4A8]/95 opacity-0 transition-opacity duration-500 md:group-hover:opacity-100">
            <span className="border-b border-white/40 pb-1.5 text-2xl font-light tracking-[0.15em] text-brand-charcoal">
              探索产品
            </span>
          </div>
        </div>

        {/* Row 1, Col 2: 文字卡 */}
        <div className="kinetic-cell kinetic-text-cell kinetic-cell-yellow kinetic-cell-steps no-hover-effect text-center">
          <div className="kinetic-title-sm">
            更少步骤
            <br />
            更多呵护
          </div>
          <div className="kinetic-body-sm">
            美丽不该复杂
            <br />
            专注美好生活
          </div>
        </div>

        {/* Row 1, Col 3-4: 官方指南宽图片卡 */}
        <div
          className="kinetic-cell kinetic-image-cell kinetic-cell-less no-hover-effect group relative cursor-pointer"
          style={{ gridColumn: "span 2", aspectRatio: "auto" }}
        >
          <Link href="/guide" className="absolute inset-0 z-20" aria-label="官方指南" />
          <Image
            src="/images/kinetic-guide.webp"
            alt="NIHPLOD 官方护肤指南"
            fill
            className="kinetic-cell-image"
            style={{ objectPosition: "center 40%" }}
            sizes="(max-width: 819px) 86vw, 50vw"
          />
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[#E8D5B0]/95 opacity-0 transition-opacity duration-500 md:group-hover:opacity-100">
            <span className="border-b border-white/40 pb-1.5 text-2xl font-light tracking-[0.15em] text-brand-charcoal">
              官方指南
            </span>
          </div>
        </div>

        <div className="kinetic-cell kinetic-image-cell kinetic-cell-skin no-hover-effect group relative cursor-pointer">
          <Link href="/about" className="absolute inset-0 z-20" aria-label="关于旎柏" />
          {isDesktop ? (
            <Image
              src="/images/kinetic-desktop.webp?v=2"
              alt="旎柏品牌故事 - 桌面端展示"
              fill
              className="kinetic-cell-image"
              sizes="25vw"
            />
          ) : (
            <Image
              src="/images/kinetic-mobile.webp?v=2"
              alt="旎柏品牌故事 - 移动端展示"
              fill
              className="kinetic-cell-image"
              sizes="100vw"
            />
          )}
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[#DECCB0]/95 opacity-0 transition-opacity duration-500 md:group-hover:opacity-100">
            <span className="border-b border-white/40 pb-1.5 text-2xl font-light tracking-[0.15em] text-brand-charcoal">
              品牌故事
            </span>
          </div>
        </div>

        {/* Row 2, Col 3: 文字卡 */}
        <div className="kinetic-cell kinetic-text-cell kinetic-cell-orange kinetic-cell-reverse no-hover-effect text-center">
          <div className="kinetic-title-sm">逆转时光</div>
          <div className="kinetic-desc">REVERSE TIME</div>
        </div>

        {/* Row 2, Col 4: 登录/CTA卡 */}
        <div
          className="kinetic-cell kinetic-login-cell kinetic-cell-login no-hover-effect cursor-pointer"
          onClick={user ? () => openUserCenter() : handleLoginClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              user ? openUserCenter() : redirectToLogin();
            }
          }}
        >
          <div className="kinetic-btn-group pointer-events-none">
            <div className="flex w-full flex-col items-center justify-center gap-1.5 sm:mb-2">
              {/* 头像圆：手机端 56px + 下方文字 caption，sm+（含 PC）恢复 80px 纯图标圆 + 独立按钮 */}
              <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-brand-charcoal/20 bg-white/30 sm:h-20 sm:w-20">
                {user?.avatar ? (
                  <Image
                    src={user.avatar}
                    alt={user.nickname || "用户头像"}
                    fill
                    className="rounded-full object-cover"
                  />
                ) : (
                  <div className="relative h-6 w-6 opacity-70 sm:h-7 sm:w-7 sm:opacity-50">
                    <Image
                      src="/images/profile-icon.svg"
                      alt="用户头像"
                      fill
                      className="object-contain"
                    />
                  </div>
                )}
              </div>
              {/* 手机端：文字从圈内拿出，作圆下方的细体小字 caption（非按钮）；sm+ 隐藏 */}
              <span className="max-w-full truncate px-2 text-[11px] font-light tracking-[0.15em] text-brand-charcoal/70 sm:hidden">
                {user ? user.nickname || "会员中心" : "会员登录"}
              </span>
            </div>
            {user ? (
              <div className="group hidden w-full items-center justify-center gap-1.5 rounded-xl border border-brand-charcoal/15 bg-white/80 px-4 text-[14px] font-light tracking-[0.08em] text-brand-charcoal shadow-sm backdrop-blur-sm sm:flex sm:h-11">
                <span>进入会员中心</span>
                <ChevronRight className="h-4 w-4 opacity-70" />
              </div>
            ) : (
              <div className="group hidden w-full items-center justify-center gap-1.5 rounded-xl border border-brand-charcoal/10 bg-white/70 px-4 text-[14px] font-light tracking-[0.08em] text-brand-charcoal/80 sm:flex sm:h-11 sm:border-0 sm:bg-white/40 sm:text-brand-charcoal/70">
                <span>会员登录</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
