"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "next-view-transitions";
import { ChevronRight } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * Kinetic Grid 全局背景组件
 *
 * 特点：
 * - 米白背景 (#F0EDE1) + 微点阵图案
 * - Bento Grid 便当盒卡片布局（左侧大卡片 + 右侧3x2小卡片）
 * - 鼠标跟随的3D透视倾斜效果
 */
export function KineticBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const cellsRef = useRef<HTMLDivElement[]>([]);
  const { user, switchToLogin, openUserCenter } = useAuth();

  useEffect(() => {
    const container = containerRef.current;
    const cells = cellsRef.current;
    if (!container || cells.length === 0) return;

    const handleMouseMove = (e: MouseEvent) => {
      const x = e.clientX / window.innerWidth - 0.5;
      const y = e.clientY / window.innerHeight - 0.5;

      cells.forEach((cell, index) => {
        if (!cell) return;
        const factor = (index + 1) * 1.5;
        // 使用 CSS 自定义变量，避免与 CSS hover transform 冲突
        cell.style.setProperty("--parallax-x", `${x * factor}px`);
        cell.style.setProperty("--parallax-y", `${y * factor}px`);
        cell.style.setProperty("--parallax-rx", `${-y * 4}deg`);
        cell.style.setProperty("--parallax-ry", `${x * 4}deg`);
      });
    };

    const handleMouseLeave = () => {
      cells.forEach((cell) => {
        if (!cell) return;
        cell.style.setProperty("--parallax-x", "0");
        cell.style.setProperty("--parallax-y", "0");
        cell.style.setProperty("--parallax-rx", "0");
        cell.style.setProperty("--parallax-ry", "0");
      });
    };

    const mediaQuery = window.matchMedia("(min-width: 768px) and (hover: hover)");

    const setupListeners = () => {
      if (mediaQuery.matches) {
        container.addEventListener("mousemove", handleMouseMove);
        container.addEventListener("mouseleave", handleMouseLeave);
      } else {
        handleMouseLeave();
        container.removeEventListener("mousemove", handleMouseMove);
        container.removeEventListener("mouseleave", handleMouseLeave);
      }
    };

    setupListeners();
    mediaQuery.addEventListener("change", setupListeners);

    return () => {
      mediaQuery.removeEventListener("change", setupListeners);
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  const addCellRef = (el: HTMLDivElement | null, index: number) => {
    if (el) {
      cellsRef.current[index] = el;
    }
  };

  const handleLoginClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    switchToLogin();
  };

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

  return (
    <div ref={wrapperRef} className="kinetic-background-wrapper">
      <div className="kinetic-bg-base" />
      <div className="kinetic-dot-pattern" />
      <div className="kinetic-watermark">
        {/* PC 端水印 */}
        <div className="relative hidden opacity-[0.6] md:block">
          <Image
            src="/images/N-web.svg"
            alt="NIHPLOD 品牌水印"
            width={2800}
            height={800}
            style={{ objectFit: "contain" }}
            unoptimized
          />
        </div>
        {/* 移动端水印 - 竖版 SVG */}
        <div className="absolute inset-0 block md:hidden">
          <Image
            src="/images/watermark-mobile.png"
            alt="NIHPLOD 品牌水印"
            fill
            priority
            style={{ objectFit: "cover" }}
            className=""
          />
        </div>
      </div>

      <div ref={containerRef} className="kinetic-container">
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
        <div
          ref={(el) => addCellRef(el, 0)}
          className="kinetic-cell kinetic-cell-large kinetic-image-cell kinetic-cell-boxes group relative cursor-pointer"
        >
          <Link href="/products" className="absolute inset-0 z-20" aria-label="了解产品" />
          <Image
            src="/images/kinetic-product-hero.jpeg"
            alt="Brand Story"
            fill
            className="kinetic-cell-image grayscale transition-all duration-500 group-hover:grayscale-0"
            sizes="(max-width: 600px) 100vw, 30vw"
            priority
          />
          <div className="pointer-events-none absolute inset-0 z-10 hidden items-center justify-center bg-black/20 opacity-0 transition-opacity duration-500 group-hover:opacity-100 sm:flex">
            <span className="border-b-2 border-white/60 pb-1.5 text-2xl font-bold tracking-[0.25em] text-white">
              探索产品
            </span>
          </div>
        </div>

        {/* Row 1, Col 2: 文字卡 */}
        <div
          ref={(el) => addCellRef(el, 1)}
          className="kinetic-cell kinetic-text-cell kinetic-cell-yellow kinetic-cell-steps no-hover-effect"
        >
          <div
            className="kinetic-name"
            style={{ marginBottom: "12px", lineHeight: "1.3", fontSize: "1.8rem" }}
          >
            更少步骤
            <br />
            更多呵护
          </div>
          <div
            className="kinetic-desc"
            style={{
              fontSize: "13px",
              lineHeight: "1.5",
              letterSpacing: "0.05em",
              textTransform: "none",
              fontWeight: 400,
            }}
          >
            美丽不该复杂
            <br />
            专注美好生活
          </div>
        </div>

        {/* Row 1, Col 3-4: 官方指南宽图片卡 */}
        <div
          ref={(el) => addCellRef(el, 2)}
          className="kinetic-cell kinetic-image-cell kinetic-cell-less group relative cursor-pointer"
          style={{ gridColumn: "span 2", aspectRatio: "auto" }}
        >
          <Link href="/guide" className="absolute inset-0 z-20" aria-label="官方指南" />
          <Image
            src="/images/kinetic-guide.webp"
            alt="官方指南"
            fill
            className="kinetic-cell-image grayscale transition-all duration-500 group-hover:grayscale-0"
            sizes="(max-width: 600px) 100vw, 50vw"
          />
          <div className="pointer-events-none absolute inset-0 z-10 hidden items-center justify-center bg-black/20 opacity-0 transition-opacity duration-500 group-hover:opacity-100 sm:flex">
            <span className="border-b-2 border-white/60 pb-1.5 text-2xl font-bold tracking-[0.25em] text-white">
              官方指南
            </span>
          </div>
        </div>

        <div
          ref={(el) => addCellRef(el, 3)}
          className="kinetic-cell kinetic-image-cell kinetic-cell-skin group relative cursor-pointer"
        >
          <Link href="/about" className="absolute inset-0 z-20" aria-label="关于旎柏" />
          {/* Desktop Image */}
          <Image
            src="/images/kinetic-desktop.webp"
            alt="Product Desktop"
            fill
            className="kinetic-cell-image hidden !filter-none transition-all duration-500 xl:block"
            sizes="(max-width: 1280px) 100vw, 25vw"
          />
          {/* Mobile Image */}
          <Image
            src="/images/kinetic-mobile.webp"
            alt="Product Mobile"
            fill
            className="kinetic-cell-image block !filter-none transition-all duration-500 xl:hidden"
            sizes="100vw"
          />
        </div>

        {/* Row 2, Col 3: 文字卡 */}
        <div
          ref={(el) => addCellRef(el, 4)}
          className="kinetic-cell kinetic-text-cell kinetic-cell-orange kinetic-cell-reverse no-hover-effect"
        >
          <div className="kinetic-name" style={{ fontSize: "1.8rem" }}>
            逆转时光
          </div>
          <div
            className="kinetic-desc"
            style={{
              fontSize: "13px",
              letterSpacing: "0.05em",
              textTransform: "none",
              fontWeight: 400,
              opacity: 0.8,
            }}
          >
            REVERSE TIME
          </div>
        </div>

        {/* Row 2, Col 4: 登录/CTA卡 */}
        <div
          ref={(el) => addCellRef(el, 5)}
          className="kinetic-cell kinetic-login-cell kinetic-cell-login no-hover-effect"
        >
          <div className="kinetic-btn-group">
            {user ? (
              <>
                <div className="group/avatar mb-4 flex w-full flex-col items-center justify-center">
                  <div className="relative flex h-14 w-14 items-center justify-center sm:h-20 sm:w-20">
                    <div className="absolute inset-0 scale-[1.15] rounded-full border border-brand-charcoal/5 transition-transform duration-1000 ease-out group-hover/avatar:scale-[1.2] sm:scale-125 sm:group-hover/avatar:scale-150" />
                    <div className="absolute inset-[2px] rounded-full border border-brand-charcoal/10 transition-transform duration-700 group-hover/avatar:scale-95 sm:inset-4 sm:group-hover/avatar:scale-90" />
                    <div className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/60 bg-white/40 backdrop-blur-md transition-all duration-500 sm:h-16 sm:w-16">
                      {user.avatar ? (
                        <Image
                          src={user.avatar}
                          alt={user.nickname || "用户头像"}
                          fill
                          className="object-cover"
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
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openUserCenter();
                  }}
                  className="group flex h-8 min-h-0 w-full min-w-0 shrink-0 items-center justify-center gap-1 rounded-xl bg-white/30 text-xs font-medium tracking-[0.1em] text-brand-charcoal/90 backdrop-blur-sm transition-all duration-500 hover:bg-white/50 hover:text-brand-charcoal hover:shadow-sm active:scale-[0.98] sm:h-10 sm:gap-1.5 sm:text-sm sm:tracking-[0.15em]"
                >
                  <span>进入会员中心</span>
                  <ChevronRight className="h-3.5 w-3.5 opacity-70 transition-transform duration-300 group-hover:translate-x-0.5 sm:h-4 sm:w-4" />
                </button>
              </>
            ) : (
              <>
                <div className="group/avatar mb-4 flex w-full flex-col items-center justify-center">
                  <div className="relative flex h-14 w-14 items-center justify-center sm:h-20 sm:w-20">
                    <div className="absolute inset-0 scale-[1.15] rounded-full border border-brand-charcoal/5 transition-transform duration-1000 ease-out group-hover/avatar:scale-[1.2] sm:scale-125 sm:group-hover/avatar:scale-150" />
                    <div className="absolute inset-[2px] rounded-full border border-brand-charcoal/10 transition-transform duration-700 group-hover/avatar:scale-95 sm:inset-4 sm:group-hover/avatar:scale-90" />
                    <div className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/60 bg-white/40 backdrop-blur-md transition-all duration-500 sm:h-16 sm:w-16">
                      <div className="relative h-5 w-5 opacity-50 sm:h-7 sm:w-7">
                        <Image
                          src="/images/profile-icon.svg"
                          alt="用户头像"
                          fill
                          className="object-contain"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLoginClick}
                  className="flex min-h-0 w-full min-w-0 items-center justify-center gap-1 text-xs font-normal tracking-[0.1em] text-brand-charcoal/60 transition-colors duration-300 hover:text-brand-charcoal active:text-brand-charcoal/80 sm:h-10 sm:gap-1.5 sm:rounded-xl sm:bg-white/30 sm:text-sm sm:font-medium sm:tracking-[0.15em] sm:backdrop-blur-sm sm:hover:bg-white/50 sm:hover:shadow-sm sm:active:scale-[0.98]"
                >
                  <span>立即登录</span>
                  <ChevronRight className="h-3.5 w-3.5 opacity-70 transition-transform duration-300 group-hover:translate-x-0.5 sm:h-4 sm:w-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default KineticBackground;
