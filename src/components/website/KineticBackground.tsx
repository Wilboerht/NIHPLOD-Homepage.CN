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
 * - 米白背景 (#EBE5D8) + 微点阵图案
 * - Bento Grid 便当盒卡片布局（左侧大卡片 + 右侧3x2小卡片）
 * - 鼠标跟随的3D透视倾斜效果
 */
export function KineticBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const cellsRef = useRef<HTMLDivElement[]>([]);
  const { user, switchToLogin, openUserCenter } = useAuth();
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const container = containerRef.current;
    const cells = cellsRef.current;
    if (!container || cells.length === 0) return;

    let mouseRafId: number;
    let scrollRafId: number;
    let lastMouseX = 0;
    let lastMouseY = 0;

    const applyMouseParallax = () => {
      const x = lastMouseX;
      const y = lastMouseY;

      cells.forEach((cell, index) => {
        if (!cell) return;
        const factor = (index + 1) * 0.8;
        cell.style.setProperty("--parallax-x", `${x * factor}px`);
        cell.style.setProperty("--parallax-y", `${y * factor}px`);
        cell.style.setProperty("--parallax-rx", `${-y * 2}deg`);
        cell.style.setProperty("--parallax-ry", `${x * 2}deg`);
      });
    };

    const handleMouseMove = (e: MouseEvent) => {
      lastMouseX = e.clientX / window.innerWidth - 0.5;
      lastMouseY = e.clientY / window.innerHeight - 0.5;

      if (mouseRafId) return;
      mouseRafId = requestAnimationFrame(() => {
        applyMouseParallax();
        mouseRafId = 0;
      });
    };

    const handleMouseLeave = () => {
      cancelAnimationFrame(mouseRafId);
      mouseRafId = 0;
      lastMouseX = 0;
      lastMouseY = 0;
      cells.forEach((cell) => {
        if (!cell) return;
        cell.style.setProperty("--parallax-x", "0");
        cell.style.setProperty("--parallax-y", "0");
        cell.style.setProperty("--parallax-rx", "0");
        cell.style.setProperty("--parallax-ry", "0");
      });
    };

    const handleScroll = () => {
      if (scrollRafId) return;
      scrollRafId = requestAnimationFrame(() => {
        if (!prefersReducedMotion) {
          const scrollY = window.scrollY;
          const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
          const progress = maxScroll > 0 ? scrollY / maxScroll : 0;

          cells.forEach((cell, index) => {
            if (!cell) return;
            const factor = (index + 1) * 0.5;
            const offset = progress * 20 * factor;
            cell.style.setProperty("--parallax-scroll-y", `-${offset}px`);
          });
        }
        scrollRafId = 0;
      });
    };

    const mediaQuery = window.matchMedia("(min-width: 768px) and (hover: hover)");

    const setupListeners = () => {
      if (mediaQuery.matches && !prefersReducedMotion) {
        // 3D 视差已禁用
        handleMouseLeave();
      } else {
        handleMouseLeave();
        container.removeEventListener("mousemove", handleMouseMove);
        container.removeEventListener("mouseleave", handleMouseLeave);
      }
    };

    setupListeners();
    mediaQuery.addEventListener("change", setupListeners);
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      cancelAnimationFrame(mouseRafId);
      cancelAnimationFrame(scrollRafId);
      mediaQuery.removeEventListener("change", setupListeners);
      window.removeEventListener("scroll", handleScroll);
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [prefersReducedMotion]);

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
        <div className="relative hidden md:block" style={{ filter: "brightness(0) invert(0.95)", opacity: 0.22 }}>
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
        <div className="absolute inset-0 block md:hidden" style={{ filter: "brightness(0) invert(0.95)", opacity: 0.22 }}>
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
            style={{ objectPosition: "center 30%" }}
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
            style={{ marginBottom: "12px", lineHeight: "1.3", fontSize: "1.4rem", fontWeight: 400 }}
          >
            更少步骤
            <br />
            更多呵护
          </div>
          <div
            className="kinetic-desc"
            style={{
              fontSize: "14px",
              lineHeight: "1.5",
              letterSpacing: "0.12em",
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
            style={{ objectPosition: "center 40%" }}
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
          <div className="kinetic-name" style={{ fontSize: "1.4rem", fontWeight: 400 }}>
            逆转时光
          </div>
          <div
            className="kinetic-desc"
            style={{
              fontSize: "14px",
              letterSpacing: "0.08em",
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
            <div className="mb-4 flex w-full flex-col items-center justify-center">
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
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openUserCenter();
                }}
                className="group flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-brand-charcoal/15 bg-white/40 text-sm font-medium tracking-[0.15em] text-brand-charcoal/80 transition-all duration-500 hover:bg-white/60 hover:text-brand-charcoal active:scale-[0.98]"
              >
                <span>进入会员中心</span>
                <ChevronRight className="h-4 w-4 opacity-70 transition-transform duration-300 group-hover:translate-x-0.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleLoginClick}
                className="group flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-brand-charcoal/15 bg-white/40 text-sm font-medium tracking-[0.15em] text-brand-charcoal/80 transition-all duration-500 hover:bg-white/60 hover:text-brand-charcoal active:scale-[0.98]"
              >
                <span>立即登录</span>
                <ChevronRight className="h-4 w-4 opacity-70 transition-transform duration-300 group-hover:translate-x-0.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

