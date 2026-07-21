"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import DOMPurify from "isomorphic-dompurify";
import { Link } from "next-view-transitions";
import { m, AnimatePresence, useMotionValue, animate } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  CreditCard,
  Loader2,
  Heart,
  Share2,
  ShieldCheck,
  Lock,
  Truck,
  Menu,
  X,
  ChevronDown,
  Home,
} from "lucide-react";
import { ProductCard, PlatformIcon, XiaohongshuLink } from "@/components/website";
import { cn, formatPrice } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useLayout } from "@/contexts/LayoutContext";
import { useToast } from "@/components/ui/Toast";
import { useCartStore } from "@/store/cart";

interface ProductImage {
  id: string;
  url: string;
  alt: string | null;
}

interface Category {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
}

interface Product {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
  description: string;
  price: number;
  capacity: string | null;
  purchaseUrl: string | null;
  purchaseLinks: { id: string; platform: string; url: string }[];
  category: Category;
  images: ProductImage[];
  ingredients: string | null;
  usage: string | null;
  benefits: string[];
  allowDirectBuy: boolean;
  stock: number;
  origin?: string | null;
  salesCount: number;
}

interface RelatedProduct {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
  price: number;
  capacity: string | null;
  category: { name: string };
  images: { url: string; alt: string | null }[];
}

interface BreadcrumbItem {
  name: string;
  url: string;
}

interface ProductDetailContentProps {
  product: Product;
  relatedProducts: RelatedProduct[];
  breadcrumbs: BreadcrumbItem[];
}

type TabType = "description" | "ingredients" | "usage";

/**
 * 产品详情页内容组件
 * 样式对齐 Careers 页面
 */
export function ProductDetailContent({
  product,
  relatedProducts,
  breadcrumbs,
}: ProductDetailContentProps) {
  const { setDrawerOpen } = useLayout();
  const { success } = useToast();

  useEffect(() => {
    setDrawerOpen(false);
  }, [setDrawerOpen]);

  // 标记从产品列表页导航过来，返回时跳过列表页抽屉动画
  useEffect(() => {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem("products_animate", "1");
    }
  }, []);

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<TabType>("description");
  const [quantity, setQuantity] = useState(1);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const x = useMotionValue(0);
  const animationRef = useRef<ReturnType<typeof animate> | null>(null);
  const startXRef = useRef(0);
  const startTimeRef = useRef(0);
  const isDraggingRef = useRef(false);
  const justSwipedRef = useRef(false);
  const { user, openLoginModal } = useAuth();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const [desktopMenuOpen, setDesktopMenuOpen] = useState(false);
  const desktopMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mobileMenuOpen) {
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
      return () => {
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.width = "";
        window.scrollTo(0, scrollY);
      };
    }
  }, [mobileMenuOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        desktopMenuRef.current &&
        !desktopMenuRef.current.contains(event.target as Node)
      ) {
        setDesktopMenuOpen(false);
      }
    };
    if (desktopMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [desktopMenuOpen]);

  // 收藏状态从 localStorage 恢复
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(`product_favorite_${product.id}`);
    if (stored) {
      try {
        setIsLiked(JSON.parse(stored));
      } catch {
        // 忽略损坏数据
      }
    }
  }, [product.id]);

  const tabs: { key: TabType; label: string }[] = [
    { key: "description", label: "产品描述" },
    { key: "ingredients", label: "成分说明" },
    { key: "usage", label: "使用方法" },
  ];

  const tabContent: Record<TabType, string | null> = {
    description: product.description,
    ingredients: product.ingredients,
    usage: product.usage,
  };

  const handleTabKeyDown = (e: React.KeyboardEvent) => {
    const currentIndex = tabs.findIndex((t) => t.key === activeTab);
    let nextIndex = currentIndex;
    if (e.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (e.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (e.key === "Home") {
      nextIndex = 0;
    } else if (e.key === "End") {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    setActiveTab(tabs[nextIndex].key);
  };

  // 轮播容器宽度
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  // 索引变化时吸附到目标位置
  useEffect(() => {
    if (containerWidth === 0) return;
    if (animationRef.current) animationRef.current.stop();
    animationRef.current = animate(x, -currentImageIndex * containerWidth, {
      type: "spring",
      stiffness: 300,
      damping: 30,
    });
  }, [currentImageIndex, containerWidth, x]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (animationRef.current) animationRef.current.stop();
    startXRef.current = e.touches[0].clientX;
    startTimeRef.current = Date.now();
    isDraggingRef.current = true;
    justSwipedRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingRef.current || containerWidth === 0) return;
    const currentX = e.touches[0].clientX;
    const diff = startXRef.current - currentX;

    // 边界阻尼
    let dampedDiff = diff;
    if (currentImageIndex === 0 && diff < 0) {
      dampedDiff = diff * 0.3;
    } else if (currentImageIndex === product.images.length - 1 && diff > 0) {
      dampedDiff = diff * 0.3;
    }

    if (Math.abs(diff) > 10) {
      justSwipedRef.current = true;
    }

    x.set(-currentImageIndex * containerWidth - dampedDiff);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    const endX = e.changedTouches[0].clientX;
    const diff = startXRef.current - endX;
    const duration = Date.now() - startTimeRef.current;
    const velocity = Math.abs(diff) / Math.max(duration, 1);

    const SWIPE_THRESHOLD = 50;
    const VELOCITY_THRESHOLD = 0.5; // px/ms

    let newIndex = currentImageIndex;

    if (diff > SWIPE_THRESHOLD || (diff > 0 && velocity > VELOCITY_THRESHOLD)) {
      if (currentImageIndex < product.images.length - 1) {
        newIndex = currentImageIndex + 1;
      }
    } else if (diff < -SWIPE_THRESHOLD || (diff < 0 && velocity > VELOCITY_THRESHOLD)) {
      if (currentImageIndex > 0) {
        newIndex = currentImageIndex - 1;
      }
    }

    if (newIndex !== currentImageIndex) {
      setCurrentImageIndex(newIndex);
    } else {
      // 回弹
      if (animationRef.current) animationRef.current.stop();
      animationRef.current = animate(x, -currentImageIndex * containerWidth, {
        type: "spring",
        stiffness: 300,
        damping: 30,
      });
    }
  };

  const handleMainImageClick = useCallback(() => {
    if (justSwipedRef.current) {
      justSwipedRef.current = false;
      return;
    }
    setLightboxOpen(true);
  }, []);

  const handleMainImageKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setLightboxOpen(true);
    }
  }, []);

  const handleLightboxPrev = useCallback(() => {
    setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : product.images.length - 1));
  }, [product.images.length]);

  const handleLightboxNext = useCallback(() => {
    setCurrentImageIndex((prev) => (prev < product.images.length - 1 ? prev + 1 : 0));
  }, [product.images.length]);

  const handleLightboxKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!lightboxOpen) return;
      if (e.key === "ArrowLeft") handleLightboxPrev();
      if (e.key === "ArrowRight") handleLightboxNext();
      if (e.key === "Escape") setLightboxOpen(false);
    },
    [lightboxOpen, handleLightboxPrev, handleLightboxNext]
  );

  useEffect(() => {
    if (lightboxOpen) {
      document.addEventListener("keydown", handleLightboxKeyDown);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.removeEventListener("keydown", handleLightboxKeyDown);
      document.body.style.overflow = "";
    };
  }, [lightboxOpen, handleLightboxKeyDown]);

  const handleShare = useCallback(async () => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: product.name, url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        success("链接已复制");
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = url;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        success("链接已复制");
      }
    } catch {
      // 用户取消分享
    }
  }, [product.name, success]);

  const handleFavorite = useCallback(() => {
    if (!user) {
      openLoginModal();
      return;
    }
    const newState = !isLiked;
    setIsLiked(newState);
    if (typeof window !== "undefined") {
      localStorage.setItem(`product_favorite_${product.id}`, JSON.stringify(newState));
    }
    success(newState ? "已收藏" : "已取消收藏");
  }, [isLiked, openLoginModal, product.id, success, user]);

  const handleThumbnailClick = (index: number) => {
    setCurrentImageIndex(index);
  };

  const renderThumbnails = (orientation: "horizontal" | "vertical") => (
    <div
      className={cn(
        "flex gap-2",
        orientation === "vertical" ? "flex-col" : "flex-row overflow-x-auto py-1"
      )}
    >
      {product.images.map((img, index) => (
        <button
          key={img.id}
          type="button"
          onClick={() => handleThumbnailClick(index)}
          className={cn(
            "relative flex-shrink-0 overflow-hidden rounded-lg transition-all",
            orientation === "vertical" ? "h-20 w-16" : "h-16 w-12",
            currentImageIndex === index
              ? "ring-2 ring-brand-primary"
              : "ring-1 ring-brand-beige hover:ring-brand-charcoal/30"
          )}
          aria-label={`切换到第 ${index + 1} 张图片`}
          aria-current={currentImageIndex === index ? "true" : undefined}
        >
          <Image
            src={img.url}
            alt={img.alt || `${product.name} 缩略图 ${index + 1}`}
            fill
            className="object-cover"
            sizes="80px"
            loading="lazy"
          />
        </button>
      ))}
    </div>
  );

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
      className="relative flex min-h-dvh flex-col bg-[#FBF8F0]"
    >
      <style jsx global>{`
        html {
          scroll-padding-bottom: 120px;
        }
      `}</style>

      {/* 手机端背景水印 */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden lg:hidden">
        <Image
          src="/images/watermark-mobile.png"
          alt=""
          fill
          className="object-cover opacity-75 blur-[7.5px]"
          priority
        />
      </div>
      {/* 矿物纹理叠加层 */}
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.04]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* 固定顶栏导航 */}
      <nav
        aria-label="产品页导航"
        className="fixed left-0 right-0 top-0 z-50 flex w-full items-center bg-[#FBF8F0]/80 px-6 py-3 backdrop-blur-md md:px-20 md:py-6"
        style={{ pointerEvents: "none" }}
      >
        <div
          className="relative flex w-full items-center justify-center md:justify-between"
          style={{ pointerEvents: "auto" }}
        >
          {/* Logo */}
          <Link href="/">
            <div className="relative h-[30px] w-[130px] md:h-[40px] md:w-[160px]">
              <Image
                src="/images/NIHPLOD-logo.svg"
                alt="NIHPLOD"
                fill
                className="object-contain object-center md:object-left"
                priority
              />
            </div>
          </Link>

          {/* 桌面端导航链接 */}
          <div className="hidden items-center gap-1 md:flex">
            <Link
              href="/contact"
              className="group relative px-3 py-2 text-[15px] font-light tracking-[0.15em] text-[#00263E] transition-colors duration-500 hover:text-brand-charcoal-light"
            >
              联系我们
              <span className="absolute bottom-1 left-1/2 h-[1px] w-0 -translate-x-1/2 bg-current transition-all duration-500 group-hover:w-[calc(100%-1.5rem)]" />
            </Link>
            <Link
              href="/terms"
              className="group relative px-3 py-2 text-[15px] font-light tracking-[0.15em] text-[#00263E] transition-colors duration-500 hover:text-brand-charcoal-light"
            >
              服务条款
              <span className="absolute bottom-1 left-1/2 h-[1px] w-0 -translate-x-1/2 bg-current transition-all duration-500 group-hover:w-[calc(100%-1.5rem)]" />
            </Link>
            <Link
              href="/privacy"
              className="group relative px-3 py-2 text-[15px] font-light tracking-[0.15em] text-[#00263E] transition-colors duration-500 hover:text-brand-charcoal-light"
            >
              隐私政策
              <span className="absolute bottom-1 left-1/2 h-[1px] w-0 -translate-x-1/2 bg-current transition-all duration-500 group-hover:w-[calc(100%-1.5rem)]" />
            </Link>

            {/* 桌面端下拉菜单 */}
            <div ref={desktopMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setDesktopMenuOpen((prev) => !prev)}
                className="group inline-flex items-center gap-1.5 px-3 py-2 text-[15px] font-light tracking-[0.15em] text-[#00263E] transition-colors duration-500 hover:text-brand-charcoal-light"
                aria-expanded={desktopMenuOpen}
              >
                菜单
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-500 ${desktopMenuOpen ? "rotate-180" : ""}`}
                />
              </button>

              <AnimatePresence>
                {desktopMenuOpen && (
                  <m.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                    className="absolute right-0 top-full z-50 mt-2 w-56 rounded-2xl border border-brand-charcoal/5 bg-[#FBF8F0] p-2 shadow-[0_2px_4px_-1px_rgba(0,38,62,0.05),0_8px_16px_-2px_rgba(0,38,62,0.08),0_24px_48px_-6px_rgba(0,38,62,0.06)]"
                  >
                    <Link
                      href="/products"
                      onClick={() => setDesktopMenuOpen(false)}
                      className="block rounded-xl px-4 py-3 text-[15px] font-light tracking-[0.15em] text-[#00263E] transition-colors hover:bg-brand-charcoal/5"
                    >
                      产品系列
                    </Link>
                    <div className="h-px origin-top scale-y-50 bg-brand-charcoal/[0.04]" />
                    <Link
                      href="/guide"
                      onClick={() => setDesktopMenuOpen(false)}
                      className="block rounded-xl px-4 py-3 text-[15px] font-light tracking-[0.15em] text-[#00263E] transition-colors hover:bg-brand-charcoal/5"
                    >
                      护肤指南
                    </Link>
                    <div className="h-px origin-top scale-y-50 bg-brand-charcoal/[0.04]" />
                    <Link
                      href="/faq"
                      onClick={() => setDesktopMenuOpen(false)}
                      className="block rounded-xl px-4 py-3 text-[15px] font-light tracking-[0.15em] text-[#00263E] transition-colors hover:bg-brand-charcoal/5"
                    >
                      常见问题
                    </Link>
                    <div className="h-px origin-top scale-y-50 bg-brand-charcoal/[0.04]" />
                    <Link
                      href="/about"
                      onClick={() => setDesktopMenuOpen(false)}
                      className="block rounded-xl px-4 py-3 text-[15px] font-light tracking-[0.15em] text-[#00263E] transition-colors hover:bg-brand-charcoal/5"
                    >
                      品牌故事
                    </Link>
                  </m.div>
                )}
              </AnimatePresence>
            </div>

            <Link
              href="/"
              className="group relative inline-flex items-center gap-2 px-3 py-2 text-[15px] font-light tracking-[0.15em] text-[#00263E] transition-colors duration-500 hover:text-brand-charcoal-light"
            >
              <Home className="h-4 w-4" /> 返回首页
              <span className="absolute bottom-1 left-1/2 h-[1px] w-0 -translate-x-1/2 bg-current transition-all duration-500 group-hover:w-[calc(100%-1.5rem)]" />
            </Link>
          </div>

          {/* 手机端汉堡菜单按钮 */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="absolute left-0 flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-brand-charcoal/5 md:hidden"
            aria-label="打开菜单"
            aria-expanded={mobileMenuOpen}
            aria-controls="product-detail-nav-panel"
          >
            <Menu className="h-5 w-5 text-[#00263E]" />
          </button>
        </div>
      </nav>

      {/* 手机端滑出菜单面板 */}
      <div
        id="product-detail-nav-panel"
        ref={mobileMenuRef}
        role="dialog"
        aria-modal={mobileMenuOpen}
        aria-label="导航菜单"
        className={`fixed inset-0 z-[100] transition-all duration-500 md:hidden ${mobileMenuOpen ? "visible opacity-100" : "invisible opacity-0"}`}
      >
        <div
          className="absolute inset-0 bg-[#00263E]/20 backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        />
        <div
          className={`absolute left-0 top-0 h-full w-[min(300px,80vw)] transform rounded-r-3xl bg-[#FBF8F0] pb-[calc(1.25rem+env(safe-area-inset-bottom,16px))] pt-[calc(1.25rem+env(safe-area-inset-top,0px))] shadow-2xl transition-transform duration-500 ease-out ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex h-full flex-col px-6">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="mb-8 flex h-10 w-10 items-center justify-center self-end rounded-full transition-colors hover:bg-brand-charcoal/5"
              aria-label="关闭菜单"
            >
              <X className="h-5 w-5 text-[#00263E]" strokeWidth={1.5} />
            </button>

            <Link href="/" onClick={() => setMobileMenuOpen(false)} className="mb-10">
              <div className="relative h-[30px] w-[130px]">
                <Image
                  src="/images/NIHPLOD-logo.svg"
                  alt="NIHPLOD"
                  fill
                  className="object-contain object-center md:object-left"
                />
              </div>
            </Link>

            <div className="flex flex-col gap-2">
              <Link
                href="/contact"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-xl px-4 py-4 text-[15px] font-medium tracking-wider text-[#00263E] transition-colors hover:bg-brand-charcoal/5"
              >
                联系我们
              </Link>
              <Link
                href="/terms"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-xl px-4 py-4 text-[15px] font-medium tracking-wider text-[#00263E] transition-colors hover:bg-brand-charcoal/5"
              >
                服务条款
              </Link>
              <Link
                href="/privacy"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-xl px-4 py-4 text-[15px] font-medium tracking-wider text-[#00263E] transition-colors hover:bg-brand-charcoal/5"
              >
                隐私政策
              </Link>
            </div>

            <Link
              href="/"
              onClick={() => setMobileMenuOpen(false)}
              className="mt-auto flex items-center gap-2 rounded-xl px-4 py-4 text-[15px] font-medium tracking-wider text-[#00263E] transition-colors hover:bg-brand-charcoal/5"
            >
              <Home className="h-5 w-5" />
              返回首页
            </Link>
          </div>
        </div>
      </div>

      {/* 固定顶栏占位 */}
      <div className="h-[62px] shrink-0 md:h-[88px]" />

      <div className="relative z-10 flex flex-1 flex-col pb-28 lg:w-[80%] lg:mx-auto lg:pb-8">

        {/* 内容区域（全局布局已提供 <main>，此处使用 div 避免嵌套 main 地标） */}
        <div className="relative min-h-0 flex-1">
          <div className="h-full overflow-y-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="lg:grid lg:h-full lg:grid-cols-[4fr_6fr] lg:gap-12">
              {/* 左侧：图片轮播区域 */}
              <div className="lg:flex lg:flex-col lg:justify-center lg:overflow-y-auto lg:py-8">
                <div className="w-full md:mx-auto md:w-full lg:max-w-lg">
                  <div className="flex flex-col gap-4 lg:flex-row lg:gap-4">
                    {/* 桌面端缩略图列 */}
                    {product.images.length > 1 && (
                      <div className="order-2 hidden lg:order-1 lg:block">
                        {renderThumbnails("vertical")}
                      </div>
                    )}

                    {/* 主图轮播 */}
                    <div className="order-1 lg:order-2 lg:flex-1">
                      <div
                        ref={containerRef}
                        className="relative aspect-[3/4] w-full touch-pan-y overflow-hidden rounded-2xl bg-brand-beige/30"
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        onClick={handleMainImageClick}
                        onKeyDown={handleMainImageKeyDown}
                        role="button"
                        aria-label="查看大图"
                        tabIndex={0}
                      >
                        <m.div
                          className="flex h-full"
                          style={{ x }}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.4 }}
                        >
                          {product.images.map((img, index) => (
                            <div key={img.id} className="relative h-full w-full flex-shrink-0">
                              <Image
                                src={img.url}
                                alt={img.alt || product.name}
                                fill
                                priority={index === 0}
                                loading={index === 0 ? undefined : "lazy"}
                                className="object-cover"
                                sizes="(max-width: 1024px) 100vw, 50vw"
                              />
                            </div>
                          ))}
                        </m.div>
                      </div>

                      {/* 移动端缩略图条 */}
                      {product.images.length > 1 && (
                        <div className="mt-4 lg:hidden">{renderThumbnails("horizontal")}</div>
                      )}

                      {/* 图片指示器 */}
                      {product.images.length > 1 && (
                        <div className="mt-7 flex items-center justify-center gap-2">
                          {product.images.map((_, index) => (
                            <button
                              key={index}
                              type="button"
                              onClick={() => setCurrentImageIndex(index)}
                              className={cn(
                                "h-2 w-6 rounded-full border-none p-0 transition-all duration-300",
                                currentImageIndex === index
                                  ? "scale-110 bg-[#00263E]"
                                  : "bg-[#00263E]/20"
                              )}
                              aria-label={`查看第 ${index + 1} 张图片`}
                              aria-current={currentImageIndex === index ? "true" : undefined}
                            />
                          ))}
                        </div>
                      )}

                      {/* 屏幕阅读器图片切换播报 */}
                      <div className="sr-only" aria-live="polite" aria-atomic="true">
                        当前显示第 {currentImageIndex + 1} 张图片，共 {product.images.length} 张
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 右侧：产品信息 + 购买 */}
              <div className="lg:overflow-y-auto lg:py-8">
                <div className="mx-auto max-w-2xl px-4 sm:px-0">
                  {/* 产品信息 */}
                  <m.div
                    className="pt-6"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                  >
                  {/* 面包屑导航 */}
                  <nav aria-label="面包屑导航" className="mb-3">
                    <ol className="flex flex-wrap items-center gap-1.5 text-xs font-light tracking-wide">
                      {breadcrumbs.map((item, index) => {
                        const isLast = index === breadcrumbs.length - 1;
                        return (
                          <li key={item.url} className="flex items-center gap-1.5">
                            {index > 0 && (
                              <span className="text-brand-charcoal/30" aria-hidden="true">
                                &gt;
                              </span>
                            )}
                            {isLast ? (
                              <span className="text-brand-charcoal">{item.name}</span>
                            ) : (
                              <Link
                                href={item.url}
                                className="text-brand-charcoal/50 transition-colors hover:text-brand-charcoal/80"
                              >
                                {item.name}
                              </Link>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </nav>

                  {/* 产品名称 + 容量 + 操作按钮 */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-1 items-end justify-between">
                      <h1 className="font-serif text-[20px] text-brand-charcoal max-lg:font-light max-lg:tracking-[0.15em] max-lg:text-[#00263E] sm:text-[24px] lg:text-[28px]">
                        {product.name}
                      </h1>
                      {product.capacity && (
                        <span className="ml-3 shrink-0 text-sm font-light text-[#00263E]/60">
                          {product.capacity}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={handleShare}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-brand-charcoal/60 transition-colors hover:bg-brand-beige hover:text-brand-charcoal"
                        aria-label="分享"
                      >
                        <Share2 className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleFavorite}
                        className={cn(
                          "inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                          isLiked
                            ? "text-red-500 hover:bg-red-50"
                            : "text-brand-charcoal/60 hover:bg-brand-beige hover:text-brand-charcoal"
                        )}
                        aria-label={isLiked ? "取消收藏" : "收藏"}
                        aria-pressed={isLiked}
                      >
                        <Heart className={cn("h-5 w-5", isLiked && "fill-current")} />
                      </button>
                    </div>
                  </div>

                  {/* 价格、产地、销量 */}
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-lg font-light tracking-[0.12em] text-brand-charcoal max-lg:text-[#00263E]">
                      {formatPrice(product.price)}
                    </span>
                    <div className="flex flex-col items-end gap-0.5 text-xs font-light text-[#00263E]/50">
                      {product.origin && <span>产地：{product.origin}</span>}
                      <span>已售出 {product.salesCount} 件</span>
                    </div>
                  </div>

                  {/* 信任标识 */}
                  <div className="mt-4 flex flex-wrap items-center gap-4">
                    <span className="flex items-center gap-1.5 text-xs font-light text-brand-charcoal-light">
                      <ShieldCheck className="h-4 w-4" />
                      正品保证
                    </span>
                    <span className="flex items-center gap-1.5 text-xs font-light text-brand-charcoal-light">
                      <Lock className="h-4 w-4" />
                      安全支付
                    </span>
                    <span className="flex items-center gap-1.5 text-xs font-light text-brand-charcoal-light">
                      <Truck className="h-4 w-4" />
                      快速发货
                    </span>
                  </div>

                  {/* 功效标签 */}
                  {product.benefits.length > 0 && (
                    <div className="mt-6 flex flex-wrap gap-2">
                      {product.benefits.map((benefit, index) => (
                        <span
                          key={index}
                          className="rounded-full border border-brand-beige bg-[#FBF8F0] px-3 py-1 text-sm font-light text-[#00263E]"
                        >
                          {benefit}
                        </span>
                      ))}
                    </div>
                  )}
                </m.div>

                {/* Tab 区域 */}
                <div className="py-8">
                  {/* Tab 切换 */}
                  <div className="border-b border-brand-beige">
                    <div className="flex justify-start gap-6" role="tablist" aria-label="产品信息">
                      {tabs.map((tab) => (
                        <div
                          key={tab.key}
                          role="tab"
                          id={`tab-${tab.key}`}
                          aria-selected={activeTab === tab.key}
                          aria-controls={`panel-${tab.key}`}
                          tabIndex={activeTab === tab.key ? 0 : -1}
                          onClick={() => setActiveTab(tab.key)}
                          onKeyDown={handleTabKeyDown}
                          className={cn(
                            "relative cursor-pointer pb-3 text-sm font-light tracking-[0.12em] transition-colors",
                            activeTab === tab.key
                              ? "text-brand-charcoal"
                              : "text-brand-charcoal/50 hover:text-brand-charcoal/80"
                          )}
                        >
                          {tab.label}
                          {activeTab === tab.key && (
                            <m.div
                              className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00263e]"
                              layoutId="tab-indicator"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tab 内容 */}
                  <div className="mt-6">
                    {tabs.map((tab) => (
                      <div
                        key={tab.key}
                        role="tabpanel"
                        id={`panel-${tab.key}`}
                        aria-labelledby={`tab-${tab.key}`}
                        tabIndex={0}
                        className={cn(
                          "transition-opacity duration-300",
                          activeTab === tab.key ? "block opacity-100" : "hidden opacity-0"
                        )}
                      >
                        {tabContent[tab.key] ? (
                          <div
                            className="text-left text-sm font-light leading-[1.8] tracking-[0.08em] text-[#00263e]/90"
                            dangerouslySetInnerHTML={{
                              __html: DOMPurify.sanitize(tabContent[tab.key]!),
                            }}
                          />
                        ) : (
                          <p className="text-sm font-light text-[#00263e]/40">暂无内容</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 小红书链接 */}
                <XiaohongshuLink
                  categoryName={product.category.name}
                  className="flex flex-col gap-1 pb-7"
                />

                {/* 购买按钮区域 - 桌面端内联 */}
                <div className="pb-3 max-lg:hidden">
                  <div className="flex flex-col gap-3">
                    {product.allowDirectBuy && (
                      <>
                        <QuantitySelector
                          stock={product.stock}
                          quantity={quantity}
                          onChange={setQuantity}
                        />
                        <AddToCartButton
                          productId={product.id}
                          stock={product.stock}
                          quantity={quantity}
                        />
                        <DirectBuyButton
                          productId={product.id}
                          stock={product.stock}
                          quantity={quantity}
                        />
                      </>
                    )}

                    {/* 外部购买链接 - 图标形式 */}
                    <div className="flex flex-wrap items-center justify-start gap-4">
                      {product.purchaseLinks && product.purchaseLinks.length > 0 ? (
                        product.purchaseLinks.map((link) => (
                          <a
                            key={link.id}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`在${link.platform}购买`}
                            className="-m-2 inline-flex min-h-[44px] min-w-[44px] items-center justify-center p-2 transition-opacity hover:opacity-60"
                          >
                            <PlatformIcon platform={link.platform} />
                          </a>
                        ))
                      ) : product.purchaseUrl ? (
                        <a
                          href={product.purchaseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="在官网购买"
                          className="-m-2 inline-flex min-h-[44px] min-w-[44px] items-center justify-center p-2 transition-opacity hover:opacity-60"
                        >
                          <PlatformIcon platform="官网" />
                        </a>
                      ) : (
                        !product.allowDirectBuy && (
                          <span className="text-sm font-light text-[#00263e]/50">
                            暂无购买链接
                          </span>
                        )
                      )}
                    </div>
                  </div>
                </div>
                </div>

                {/* 相关产品推荐 */}
                {relatedProducts.length > 0 && (
                  <div className="mx-auto mt-8 w-full max-w-4xl border-t border-brand-beige px-4 pt-8 sm:px-0 pb-24">
                    <h2 className="mb-6 text-center font-serif text-xl text-brand-charcoal max-lg:font-light max-lg:tracking-[0.15em] max-lg:text-[#00263E]">
                      相关推荐
                    </h2>
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                      {relatedProducts.map((rp) => (
                        <Link key={rp.id} href={`/products/${rp.slug}`}>
                          <ProductCard
                            product={{
                              id: rp.id,
                              name: rp.name,
                              nameEn: rp.nameEn,
                              slug: rp.slug,
                              price: rp.price,
                              capacity: rp.capacity || undefined,
                              images: rp.images.map((img) => ({
                                url: img.url,
                                alt: img.alt || undefined,
                              })),
                              category: { name: rp.category.name },
                            }}
                          />
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 移动端底部固定购买栏 */}
        {product.allowDirectBuy && (
          <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-brand-charcoal/10 bg-[#FBF8F0]/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-md lg:hidden">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <QuantitySelector
                  stock={product.stock}
                  quantity={quantity}
                  onChange={setQuantity}
                  compact
                />
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <AddToCartButton productId={product.id} stock={product.stock} quantity={quantity} />
                <DirectBuyButton productId={product.id} stock={product.stock} quantity={quantity} />
              </div>
            </div>
          </div>
        )}

      </div>

      {/* 底部版权信息 */}
      <footer className="mt-auto border-t border-brand-charcoal/10 max-lg:border-0">
        <div className="container mx-auto px-6 py-6 text-center md:px-8 lg:px-12 xl:px-16 max-lg:pb-24">
          <p className="text-[11px] font-light tracking-[0.15em] text-brand-charcoal/[0.48]">
            &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
          </p>
        </div>
      </footer>

      {/* 图片灯箱 */}
      <AnimatePresence>
        {lightboxOpen && (
          <ImageLightbox
            images={product.images}
            productName={product.name}
            currentIndex={currentImageIndex}
            onClose={() => setLightboxOpen(false)}
            onPrev={handleLightboxPrev}
            onNext={handleLightboxNext}
          />
        )}
      </AnimatePresence>
    </m.div>
  );
}

/**
 * 图片灯箱组件
 */
function ImageLightbox({
  images,
  productName,
  currentIndex,
  onClose,
  onPrev,
  onNext,
}: {
  images: ProductImage[];
  productName: string;
  currentIndex: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const currentImage = images[currentIndex];
  if (!currentImage) return null;

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
    >
      {/* 关闭按钮 */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute right-4 top-4 z-10 inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20"
        aria-label="关闭"
      >
        <X className="h-6 w-6" />
      </button>

      {/* 上一张 */}
      {images.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          className="absolute left-2 top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20 sm:left-4"
          aria-label="上一张"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {/* 当前图片 */}
      <div
        className="relative max-h-[90vh] w-full max-w-4xl px-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-[3/4] w-full">
          <Image
            src={currentImage.url}
            alt={currentImage.alt || productName}
            fill
            className="object-contain"
            sizes="100vw"
            priority
          />
        </div>
      </div>

      {/* 下一张 */}
      {images.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          className="absolute right-2 top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20 sm:right-4"
          aria-label="下一张"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {/* 图片计数 */}
      <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full bg-white/10 px-4 py-1.5 text-sm text-white backdrop-blur-md">
        {currentIndex + 1} / {images.length}
      </div>
    </m.div>
  );
}

/**
 * 加入购物车按钮组件
 */
function AddToCartButton({
  productId,
  stock,
  quantity,
}: {
  productId: string;
  stock: number;
  quantity: number;
}) {
  const [loading, setLoading] = useState(false);
  const { user, openLoginModal } = useAuth();
  const { success, error: showError } = useToast();
  const { addToCart } = useCartStore();

  const handleAddToCart = async () => {
    if (!user) {
      openLoginModal();
      return;
    }

    if (stock <= 0) {
      showError("商品已售罄");
      return;
    }

    setLoading(true);
    try {
      const result = await addToCart(productId, quantity);
      if (result) {
        success("已加入购物车");
      } else {
        showError("添加失败，请重试");
      }
    } catch {
      showError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  const isOutOfStock = stock <= 0;

  return (
    <button
      type="button"
      onClick={handleAddToCart}
      disabled={loading || isOutOfStock}
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-lg py-3 font-light tracking-[0.12em] transition-colors",
        isOutOfStock
          ? "cursor-not-allowed bg-gray-300 text-gray-500"
          : "bg-brand-primary text-white hover:bg-brand-primary/90"
      )}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <ShoppingCart className="h-4 w-4" />
      )}
      <span>{isOutOfStock ? "已售罄" : "加入购物车"}</span>
    </button>
  );
}

/**
 * 直接购买按钮组件 - 不经购物车直接结算
 */
function DirectBuyButton({
  productId,
  stock,
  quantity,
}: {
  productId: string;
  stock: number;
  quantity: number;
}) {
  const [loading, setLoading] = useState(false);
  const { user, openCheckout, openLoginModal } = useAuth();
  const { error: showError } = useToast();

  const handleDirectBuy = () => {
    if (!user) {
      openLoginModal();
      return;
    }

    if (stock <= 0) {
      showError("商品已售罄");
      return;
    }

    if (quantity > stock) {
      showError(`库存不足，仅剩 ${stock} 件`);
      return;
    }

    setLoading(true);
    try {
      openCheckout([productId], { [productId]: quantity });
    } catch {
      showError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  const isOutOfStock = stock <= 0;

  return (
    <button
      type="button"
      onClick={handleDirectBuy}
      disabled={loading || isOutOfStock}
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-lg py-3 font-light tracking-[0.12em] transition-colors",
        isOutOfStock
          ? "cursor-not-allowed bg-gray-300 text-gray-500"
          : "border border-brand-primary text-brand-primary hover:bg-brand-primary/10"
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
      <span>{isOutOfStock ? "已售罄" : "直接购买"}</span>
    </button>
  );
}

/**
 * 数量选择器组件
 */
function QuantitySelector({
  stock,
  quantity,
  onChange,
  compact = false,
}: {
  stock: number;
  quantity: number;
  onChange: (q: number) => void;
  compact?: boolean;
}) {
  const handleDecrease = () => {
    if (quantity > 1) onChange(quantity - 1);
  };
  const handleIncrease = () => {
    if (quantity < stock) onChange(quantity + 1);
  };
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 1 && val <= stock) {
      onChange(val);
    }
  };

  const canDecrease = quantity > 1;
  const canIncrease = quantity < stock;

  return (
    <div className="flex items-center gap-3">
      {!compact && (
        <label htmlFor="product-quantity" className="text-sm font-light text-brand-charcoal/60">
          数量
        </label>
      )}
      <div className="flex items-center rounded-lg border border-brand-beige bg-[#FBF8F0]">
        <button
          type="button"
          onClick={handleDecrease}
          disabled={!canDecrease}
          aria-disabled={!canDecrease}
          className="flex h-9 w-9 items-center justify-center rounded-l-lg text-brand-charcoal/60 transition-colors hover:bg-brand-beige disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="减少数量"
        >
          -
        </button>
        <input
          id="product-quantity"
          type="number"
          min={1}
          max={stock}
          value={quantity}
          onChange={handleInputChange}
          aria-describedby="stock-hint"
          className="h-9 w-12 border-x border-brand-beige bg-transparent text-center text-sm text-brand-charcoal outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button
          type="button"
          onClick={handleIncrease}
          disabled={!canIncrease}
          aria-disabled={!canIncrease}
          className="flex h-9 w-9 items-center justify-center rounded-r-lg text-brand-charcoal/60 transition-colors hover:bg-brand-beige disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="增加数量"
        >
          +
        </button>
      </div>
      <span id="stock-hint" className="text-xs text-brand-charcoal/40">
        库存 {stock} 件
      </span>
    </div>
  );
}
