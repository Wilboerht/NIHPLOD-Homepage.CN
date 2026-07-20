"use client";

import { useEffect, useRef } from "react";
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
  const { user, switchToLogin, openUserCenter } = useAuth();

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

  const handleLoginClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    switchToLogin();
  };

  return (
    <div ref={wrapperRef} className="kinetic-background-wrapper">
      <div className="kinetic-bg-base" />
      <div className="kinetic-dot-pattern" />
      <div className="kinetic-watermark">
        {/* PC 端水印 */}
        <div
          className="relative hidden md:block"
          style={{ filter: "brightness(0) invert(0.95)", opacity: 0.22 }}
        >
          <Image
            src="/images/N-web.svg"
            alt="NIHPLOD 品牌水印"
            width={2800}
            height={800}
            style={{ objectFit: "contain" }}
            priority
            unoptimized
          />
        </div>
        {/* 移动端水印 - 竖版 SVG */}
        <div
          className="absolute inset-0 block md:hidden"
          style={{ filter: "brightness(0) invert(0.95)", opacity: 0.22 }}
        >
          <Image
            src="/images/watermark-mobile.png"
            alt="NIHPLOD 品牌水印"
            fill
            priority
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
        <div className="kinetic-cell kinetic-cell-large kinetic-image-cell kinetic-cell-boxes group relative cursor-pointer">
          <Link href="/products" className="absolute inset-0 z-20" aria-label="了解产品" />
          <Image
            src="/images/kinetic-product-hero.jpeg"
            alt="NIHPLOD 产品系列"
            fill
            className="kinetic-cell-image transition-all duration-500 group-hover:scale-105"
            style={{ objectPosition: "center 30%" }}
            sizes="(max-width: 600px) 100vw, 30vw"
            priority
          />
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/20 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
            <span className="border-b-2 border-white/60 pb-1.5 text-2xl font-bold tracking-[0.25em] text-white">
              探索产品
            </span>
          </div>
        </div>

        {/* Row 1, Col 2: 文字卡 */}
        <div className="kinetic-cell kinetic-text-cell kinetic-cell-yellow kinetic-cell-steps no-hover-effect">
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
          className="kinetic-cell kinetic-image-cell kinetic-cell-less group relative cursor-pointer"
          style={{ gridColumn: "span 2", aspectRatio: "auto" }}
        >
          <Link href="/guide" className="absolute inset-0 z-20" aria-label="官方指南" />
          <Image
            src="/images/kinetic-guide.webp"
            alt="NIHPLOD 官方护肤指南"
            fill
            className="kinetic-cell-image transition-all duration-500 group-hover:scale-105"
            style={{ objectPosition: "center 40%" }}
            sizes="(max-width: 600px) 100vw, 50vw"
          />
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/20 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
            <span className="border-b-2 border-white/60 pb-1.5 text-2xl font-bold tracking-[0.25em] text-white">
              官方指南
            </span>
          </div>
        </div>

        <div className="kinetic-cell kinetic-image-cell kinetic-cell-skin group relative cursor-pointer">
          <Link href="/about" className="absolute inset-0 z-20" aria-label="关于旎柏" />
          {/* Desktop Image */}
          <Image
            src="/images/kinetic-desktop.webp"
            alt="旎柏品牌故事 - 桌面端展示"
            fill
            className="kinetic-cell-image hidden transition-all duration-500 group-hover:scale-105 xl:block"
            sizes="(max-width: 1280px) 100vw, 25vw"
          />
          {/* Mobile Image */}
          <Image
            src="/images/kinetic-mobile.webp"
            alt="旎柏品牌故事 - 移动端展示"
            fill
            className="kinetic-cell-image block transition-all duration-500 group-hover:scale-105 xl:hidden"
            sizes="100vw"
          />
        </div>

        {/* Row 2, Col 3: 文字卡 */}
        <div className="kinetic-cell kinetic-text-cell kinetic-cell-orange kinetic-cell-reverse no-hover-effect">
          <div className="kinetic-title-sm">逆转时光</div>
          <div className="kinetic-desc">REVERSE TIME</div>
        </div>

        {/* Row 2, Col 4: 登录/CTA卡 */}
        <div className="kinetic-cell kinetic-login-cell kinetic-cell-login no-hover-effect">
          <div className="kinetic-btn-group">
            <div className="mb-2 flex w-full items-center justify-center">
              <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-brand-charcoal/20 bg-white/30 transition-all duration-300 hover:scale-105 hover:border-brand-charcoal/40 sm:h-20 sm:w-20">
                {user?.avatar ? (
                  <Image
                    src={user.avatar}
                    alt={user.nickname || "用户头像"}
                    fill
                    className="rounded-full object-cover"
                  />
                ) : (
                  <div className="relative h-5 w-5 opacity-50 sm:h-7 sm:w-7">
                    <Image
                      src="/images/profile-icon.svg"
                      alt="用户头像"
                      fill
                      className="object-contain"
                    />
                  </div>
                )}
              </div>
            </div>
            {user ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openUserCenter();
                }}
                className="group flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-brand-charcoal/15 bg-white/80 px-4 text-sm font-medium tracking-[0.15em] text-brand-charcoal shadow-sm backdrop-blur-sm transition-all duration-300 hover:border-brand-charcoal/30 hover:bg-brand-charcoal hover:text-white active:scale-[0.98]"
              >
                <span>进入会员中心</span>
                <ChevronRight className="h-4 w-4 opacity-70 transition-transform duration-300 group-hover:translate-x-0.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleLoginClick}
                className="group flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-white/40 px-4 text-sm font-light tracking-[0.15em] text-brand-charcoal/70 transition-all duration-300 hover:bg-white/70 hover:text-brand-charcoal active:scale-[0.98]"
              >
                <span>会员登录</span>
                <ChevronRight className="h-4 w-4 opacity-70 transition-transform duration-300 group-hover:translate-x-0.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
