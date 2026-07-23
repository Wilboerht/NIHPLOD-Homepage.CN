"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "next-view-transitions";
import { ChevronRight } from "lucide-react";
import { animate, m, useMotionValue } from "framer-motion";

/** 移动端氛围层 Slogan 轮播数据 */
const AMBIENT_SLOGANS = [
  { zh: "逆转时光", en: "REVERSE TIME" },
  { zh: "更少步骤，更多呵护", en: "LESS STEPS, MORE CARE" },
  { zh: "美丽不该复杂", en: "BEAUTY WITHOUT COMPLEXITY" },
  { zh: "源自海豚的灵感", en: "INSPIRED BY DOLPHINS" },
];

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
  const [sloganIndex, setSloganIndex] = useState(0);
  // 轨道位移 MotionValue：手动控制，确保循环回位为物理级瞬间跳变（.set），绝无反向动画
  const ROW_H = 44;
  const sloganY = useMotionValue(ROW_H * 2);

  // Slogan 轮播定时器：只负责推进索引
  useEffect(() => {
    const id = setInterval(() => setSloganIndex((p) => p + 1), 5000);
    return () => clearInterval(id);
  }, []);

  // 轨道位移：正常步进平滑上移；一个循环结束时 .set() 瞬间回位（三倍轨道内容等价，视觉零感知）
  useEffect(() => {
    const next = sloganIndex + 1;
    if (next >= AMBIENT_SLOGANS.length * 2) {
      sloganY.set(ROW_H * 2);
      setSloganIndex(0);
    } else {
      void animate(sloganY, ROW_H * (2 - next), {
        duration: 1.2,
        ease: [0.16, 1, 0.3, 1],
      });
    }
  }, [sloganIndex, sloganY]);

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
        {/* 移动端水印 - 竖版，深色水印在浅色背景上形成品牌纹理 */}
        <div
          className="kinetic-watermark-mobile absolute inset-0 block md:hidden"
          style={{ filter: "brightness(0)" }}
        >
          <Image
            src="/images/watermark-mobile.webp"
            alt="NIHPLOD 品牌水印"
            fill
            priority
            style={{ objectFit: "cover" }}
          />
        </div>
      </div>

      {/* 移动端全屏氛围层 - 替代便当盒网格 */}
      <div className="kinetic-ambient-mobile" aria-hidden="true">
        <div className="kinetic-ambient-particle kinetic-ambient-particle-1" />
        <div className="kinetic-ambient-particle kinetic-ambient-particle-2" />
        <div className="kinetic-ambient-particle kinetic-ambient-particle-3" />
        <div className="kinetic-ambient-particle kinetic-ambient-particle-4" />
        <div className="kinetic-ambient-particle kinetic-ambient-particle-5" />

        {/* 品牌 Logo + Slogan + 产品全家福 - 整体居中于抽屉按钮与 Dock 之间 */}
        <div className="kinetic-ambient-center">
          <div className="kinetic-ambient-logo">
            <Image
              src="/images/NIHPLOD-logo.svg"
              alt="NIHPLOD"
              width={144}
              height={36}
              priority
            />
          </div>
          <div className="kinetic-ambient-slogan">
            <m.div
              className="kinetic-ambient-slogan-track"
              style={{ y: sloganY }}
            >
              {[...AMBIENT_SLOGANS, ...AMBIENT_SLOGANS, ...AMBIENT_SLOGANS].map(
                (s, i) => {
                  const d = i - sloganIndex;
                  const level = Math.min(Math.abs(d), 2);
                  return (
                    <div
                      key={i}
                      className={`kinetic-ambient-slogan-row kinetic-ambient-slogan-row--${level}`}
                    >
                      {s.zh}
                    </div>
                  );
                }
              )}
            </m.div>
          </div>
          <div className="kinetic-ambient-badge">
            <Image
              src="/images/gift-badge.webp"
              alt="NIHPLOD 护肤系列全家福"
              width={300}
              height={163}
              className="kinetic-ambient-badge-img"
            />
          </div>
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
        <div className="kinetic-cell kinetic-cell-large kinetic-image-cell kinetic-cell-boxes group relative cursor-pointer no-hover-effect">
          <Link href="/products" className="absolute inset-0 z-20" aria-label="了解产品" />
          <Image
            src="/images/kinetic-product-hero.jpeg"
            alt="NIHPLOD 产品系列"
            fill
            className="kinetic-cell-image"
            style={{ objectPosition: "center 30%" }}
            sizes="(max-width: 600px) 100vw, 30vw"
            priority
          />
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[#D4C4A8]/95 opacity-0 transition-opacity duration-500 md:group-hover:opacity-100">
            <span className="border-b border-white/40 pb-1.5 text-2xl font-light tracking-[0.15em] text-brand-charcoal">
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
          className="kinetic-cell kinetic-image-cell kinetic-cell-less group relative cursor-pointer no-hover-effect"
          style={{ gridColumn: "span 2", aspectRatio: "auto" }}
        >
          <Link href="/guide" className="absolute inset-0 z-20" aria-label="官方指南" />
          <Image
            src="/images/kinetic-guide.webp"
            alt="NIHPLOD 官方护肤指南"
            fill
            className="kinetic-cell-image"
            style={{ objectPosition: "center 40%" }}
            sizes="(max-width: 600px) 100vw, 50vw"
          />
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[#E8D5B0]/95 opacity-0 transition-opacity duration-500 md:group-hover:opacity-100">
            <span className="border-b border-white/40 pb-1.5 text-2xl font-light tracking-[0.15em] text-brand-charcoal">
              官方指南
            </span>
          </div>
        </div>

        <div className="kinetic-cell kinetic-image-cell kinetic-cell-skin group relative cursor-pointer no-hover-effect">
          <Link href="/about" className="absolute inset-0 z-20" aria-label="关于旎柏" />
          {/* Desktop Image */}
          <Image
            src="/images/kinetic-desktop.webp?v=2"
            alt="旎柏品牌故事 - 桌面端展示"
            fill
            className="kinetic-cell-image hidden xl:block"
            sizes="(max-width: 1280px) 100vw, 25vw"
          />
          {/* Mobile Image */}
          <Image
            src="/images/kinetic-mobile.webp?v=2"
            alt="旎柏品牌故事 - 移动端展示"
            fill
            className="kinetic-cell-image block xl:hidden"
            sizes="100vw"
          />
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
          className="kinetic-cell kinetic-login-cell kinetic-cell-login cursor-pointer no-hover-effect"
          onClick={user ? () => openUserCenter() : handleLoginClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); user ? openUserCenter() : switchToLogin(); } }}
        >
          <div className="kinetic-btn-group pointer-events-none">
            <div className="mb-2 flex w-full items-center justify-center">
              <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-brand-charcoal/20 bg-white/30 sm:h-20 sm:w-20">
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
              <div className="group flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-brand-charcoal/15 bg-white/80 px-4 text-[14px] font-light tracking-[0.08em] text-brand-charcoal shadow-sm backdrop-blur-sm">
                <span>进入会员中心</span>
                <ChevronRight className="h-4 w-4 opacity-70" />
              </div>
            ) : (
              <div className="group flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-white/40 px-4 text-[14px] font-light tracking-[0.08em] text-brand-charcoal/70">
                <span>会员登录</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
