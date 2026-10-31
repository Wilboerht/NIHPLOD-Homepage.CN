"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useLayout } from "@/contexts/LayoutContext";
import { isCurrentPage } from "@/lib/utils";
import { Link } from "next-view-transitions";

/**
 * 便当盒卡片完整渲染的页面白名单（含子路由，如产品详情页）。
 * 其他页面仅保留背景底色/点阵/水印，避免非首页页面也加载卡片大图。
 */
const CARD_RENDER_PATHS = ["/", "/about", "/products", "/guide", "/faq"];

const BENTO_IMAGE_PLACEHOLDERS = {
  productHero: {
    dominantColor: "#d8c8b8",
    blurDataURL:
      "data:image/webp;base64,UklGRoYAAABXRUJQVlA4IHoAAADwAwCdASoQABgAPu1iqU2ppaOiMAgBMB2JYwCdACP63wzd02z3Pv0AAP7HVpxeQM3uXdhYTMy4z99em4a16syH9gU7LofCr1jXp+Pk1mX4yWLV2epcWsfOMpIg830JSKyu3DY99fIEwDKhB6mdW77uFJsw36pIsKAAAA==",
  },
  storyDesktop: {
    dominantColor: "#e8d8c8",
    blurDataURL:
      "data:image/webp;base64,UklGRjgAAABXRUJQVlA4ICwAAABwAQCdASoQABAAA4BaJYwCdAFAAAD+8GKY4V9eQ6vc0510hc8AchyfjUigAA==",
  },
  storyMobile: {
    dominantColor: "#e8d8c8",
    blurDataURL:
      "data:image/webp;base64,UklGRi4AAABXRUJQVlA4ICIAAABwAQCdASoQAAgAA4BaJYwCdAF1AAD+8GOpW1XIV+IV1QAA",
  },
  advisor: {
    dominantColor: "#f8f8e8",
    blurDataURL:
      "data:image/webp;base64,UklGRk4AAABXRUJQVlA4IEIAAADQAQCdASoQAAgAA4BaJQBOgCG/Y1IsgAD+9xA2pmnzDzwb0vG/1bSMMdROQ8MhtQzUwrIePDKnxPoV0e//jFlAAAA=",
  },
  guide: {
    dominantColor: "#c8b8a8",
    blurDataURL:
      "data:image/webp;base64,UklGRmYAAABXRUJQVlA4IFoAAAAQBACdASoQABUAPu1iqU2ppaQiMAgBMB2JQBYdhDvRBgg5f8JX4UKGMAD+rpN0mmRKP5I/e/hPC5Gtg5Qygxh8IYcwhuQPYTISQMSk/rAuYSCdJHSQzFJAAAA=",
  },
} as const;

interface BentoImageProps {
  src: string;
  alt: string;
  sizes: string;
  blurDataURL: string;
  dominantColor: string;
  objectPosition?: string;
}

function BentoImage({
  src,
  alt,
  sizes,
  blurDataURL,
  dominantColor,
  objectPosition,
}: BentoImageProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [isLoaded, setIsLoaded] = useState(true);

  useEffect(() => {
    const image = imageRef.current;
    if (image && !image.complete) {
      setIsLoaded(false);
    }
  }, []);

  return (
    <>
      <div
        aria-hidden
        data-testid="bento-image-placeholder"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundColor: dominantColor,
          backgroundImage: `url("${blurDataURL}")`,
          backgroundPosition: objectPosition ?? "center",
          backgroundSize: "cover",
          filter: "blur(18px)",
          transform: "scale(1.08)",
        }}
      />
      <Image
        ref={imageRef}
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        onLoad={() => setIsLoaded(true)}
        className={`kinetic-cell-image transition-opacity duration-500 ease-out motion-reduce:transition-none ${
          isLoaded ? "opacity-100" : "opacity-0"
        }`}
        style={{ objectPosition }}
      />
    </>
  );
}

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
  const { setDrawerOpen } = useLayout();
  const pathname = usePathname();
  const showCards = CARD_RENDER_PATHS.some((path) => isCurrentPage(pathname, path));

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

  // 卡片指向当前页时：不重复导航，直接展开抽屉（与底部导航栏行为一致）
  const handleCardClick = useCallback(
    (href: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (pathname === href) {
        e.preventDefault();
        setDrawerOpen(true);
      }
    },
    [pathname, setDrawerOpen]
  );

  const handleLoginClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (user) {
        openUserCenter();
      } else {
        redirectToLogin();
      }
    },
    [user, openUserCenter, redirectToLogin]
  );

  return (
    <div ref={wrapperRef} className="kinetic-background-wrapper">
      <div className="kinetic-bg-base" />
      <div className="kinetic-dot-pattern" />
      <div className="kinetic-watermark">
        {/* PC 端水印（≥1025px 断点切换见 globals.css，与便当盒移动端断点对齐） */}
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

      {showCards && (
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
            <Link
              href="/products"
              onClick={handleCardClick("/products")}
              className="absolute inset-0 z-20"
              aria-label="了解产品"
            />
            <BentoImage
              src="/images/kinetic-product-hero.webp"
              alt="NIHPLOD 产品系列"
              sizes="(max-width: 819px) 40vw, (max-width: 1024px) 25vw, 22vw"
              objectPosition="center 30%"
              {...BENTO_IMAGE_PLACEHOLDERS.productHero}
            />
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[#D4C4A8]/95 opacity-0 transition-opacity duration-500 md:group-hover:opacity-100">
              <span className="border-b border-white/40 pb-1.5 text-2xl font-light tracking-[0.15em] text-brand-charcoal">
                探索产品
              </span>
            </div>
          </div>

          {/* Row 1, Col 2: 品牌故事图卡（PC 单格；≤1024 由 order 重排，位置不受影响） */}
          <div className="kinetic-cell kinetic-image-cell kinetic-cell-skin group relative cursor-pointer">
            <Link
              href="/about"
              onClick={handleCardClick("/about")}
              className="absolute inset-0 z-20"
              aria-label="关于旎柏"
            />
            <div className="kinetic-image-desktop absolute inset-0">
              <BentoImage
                src="/images/kinetic-desktop.webp?v=2"
                alt="旎柏品牌故事 - 桌面端展示"
                sizes="22vw"
                {...BENTO_IMAGE_PLACEHOLDERS.storyDesktop}
              />
            </div>
            <div className="kinetic-image-mobile absolute inset-0">
              <BentoImage
                src="/images/kinetic-mobile.webp?v=2"
                alt="旎柏品牌故事 - 移动端展示"
                sizes="(max-width: 1024px) 82vw"
                {...BENTO_IMAGE_PLACEHOLDERS.storyMobile}
              />
            </div>
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[#DECCB0]/95 opacity-0 transition-opacity duration-500 md:group-hover:opacity-100">
              <span className="border-b border-white/40 pb-1.5 text-2xl font-light tracking-[0.15em] text-brand-charcoal">
                品牌故事
              </span>
            </div>
          </div>

          {/* Row 1, Col 3-4: 肌智派推广卡（仅 PC 端显示，外链测肤子站） */}
          <div
            className="kinetic-cell kinetic-image-cell kinetic-cell-advisor group relative cursor-pointer"
            style={{ gridColumn: "span 2", aspectRatio: "auto" }}
          >
            <a
              href="https://smart.nihplod.cn"
              target="_blank"
              rel="noopener noreferrer"
              className="absolute inset-0 z-20"
              aria-label="肌智派在线测肤"
            />
            <BentoImage
              src="/images/kinetic-advisor.webp"
              alt="肌智派 - 在线测肤，专属顾问"
              sizes="(max-width: 1024px) 0px, 36vw"
              {...BENTO_IMAGE_PLACEHOLDERS.advisor}
            />
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[#E8D5B0]/95 opacity-0 transition-opacity duration-500 md:group-hover:opacity-100">
              <span className="border-b border-white/40 pb-1.5 text-2xl font-light tracking-[0.15em] text-brand-charcoal">
                在线测肤
              </span>
            </div>
          </div>

          {/* Row 2, Col 2-3: 官方指南宽图片卡 */}
          <div
            className="kinetic-cell kinetic-image-cell kinetic-cell-less group relative cursor-pointer"
            style={{ gridColumn: "span 2", aspectRatio: "auto" }}
          >
            <Link
              href="/guide"
              onClick={handleCardClick("/guide")}
              className="absolute inset-0 z-20"
              aria-label="官方指南"
            />
            <BentoImage
              src="/images/kinetic-guide.webp"
              alt="NIHPLOD 官方护肤指南"
              objectPosition="center 40%"
              sizes="(max-width: 819px) 82vw, (max-width: 1024px) 80vw, 36vw"
              {...BENTO_IMAGE_PLACEHOLDERS.guide}
            />
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[#E8D5B0]/95 opacity-0 transition-opacity duration-500 md:group-hover:opacity-100">
              <span className="border-b border-white/40 pb-1.5 text-2xl font-light tracking-[0.15em] text-brand-charcoal">
                官方指南
              </span>
            </div>
          </div>

          {/* 文字卡（PC 端隐藏；平板端显示，手机端隐藏，类名勿删） */}
          <div className="kinetic-cell kinetic-text-cell kinetic-cell-cream kinetic-cell-steps text-center">
            <div className="kinetic-title-sm kinetic-serif">
              LESS
              <br />
              BUT
              <br />
              BETTER
            </div>
          </div>

          {/* Row 2, Col 3: 文字卡 */}
          <div className="kinetic-cell kinetic-text-cell kinetic-cell-orange kinetic-cell-reverse text-center">
            <div className="kinetic-title-sm">逆转时光</div>
            <div className="kinetic-desc">REVERSE TIME</div>
          </div>

          {/* Row 2, Col 4: 登录/CTA卡 */}
          <button
            type="button"
            className="kinetic-cell kinetic-login-cell kinetic-cell-login cursor-pointer"
            onClick={handleLoginClick}
          >
            <div className="kinetic-btn-group pointer-events-none">
              <div className="flex w-full flex-col items-center justify-center gap-1.5 sm:gap-2.5">
                {/* 头像圆：手机端 56px，sm+ 80px；整卡即点击热区 */}
                <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-brand-charcoal/20 bg-white/30 sm:h-20 sm:w-20">
                  {user ? (
                    /* 已登录：自定义头像，未自定义则用默认头像 */
                    <Image
                      src={user.avatar || "/images/default-avatar.png"}
                      alt={user.nickname || "用户头像"}
                      fill
                      unoptimized
                      className="rounded-full object-cover"
                    />
                  ) : (
                    /* 未登录：通用登录入口图标 */
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
                {/* 圆下方单行文字 caption（全端一致，非独立按钮） */}
                <span className="max-w-full truncate px-2 text-[11px] font-light tracking-[0.15em] text-brand-charcoal/70 sm:text-[14px]">
                  {user ? user.nickname || "会员中心" : "会员登录"}
                </span>
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
