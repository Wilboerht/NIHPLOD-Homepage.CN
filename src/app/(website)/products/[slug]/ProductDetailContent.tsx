"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import DOMPurify from "isomorphic-dompurify";
import { Link } from "next-view-transitions";
import { m, AnimatePresence, useMotionValue, animate } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Share2,
  Menu,
  X,
  Home,
  ShoppingCart,
} from "lucide-react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { ProductCard, PlatformIcon, XiaohongshuLink, AdvisorCTA } from "@/components/website";
import { cn, formatPrice } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
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

interface ProductDetailContentProps {
  product: Product;
  relatedProducts: RelatedProduct[];
  categories: { id: string; name: string; slug: string }[];
  navProducts: { id: string; slug: string; categoryId: string }[];
}

type TabType = "description" | "ingredients" | "usage";

/**
 * 产品详情页内容组件
 * 样式对齐 Careers 页面
 */
export function ProductDetailContent({
  product,
  relatedProducts,
  categories,
  navProducts,
}: ProductDetailContentProps) {
  const { setDrawerOpen } = useLayout();
  const { success, error: showError } = useToast();
  const { addToCart } = useCartStore();
  const { user, openLoginModal } = useAuth();

  useEffect(() => {
    setDrawerOpen(false);
  }, [setDrawerOpen]);

  // GA: view_item 事件
  useEffect(() => {
    trackEvent("view_item", {
      currency: "CNY",
      value: product.price,
      items: [
        {
          item_id: product.id,
          item_name: product.name,
          price: product.price,
          item_category: product.category.name,
        },
      ],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  // 标记从产品列表页导航过来，返回时跳过列表页抽屉动画
  useEffect(() => {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem("products_animate", "1");
    }
  }, []);

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<TabType>("description");
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.offsetWidth);
    const observer = new ResizeObserver(() => {
      setContainerWidth(el.offsetWidth);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const x = useMotionValue(0);
  const animationRef = useRef<ReturnType<typeof animate> | null>(null);
  const startXRef = useRef(0);
  const startTimeRef = useRef(0);
  const isDraggingRef = useRef(false);
  const justSwipedRef = useRef(false);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [buying, setBuying] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const mobileTrapRef = useFocusTrap(mobileMenuOpen);
  const lightboxTrapRef = useFocusTrap(lightboxOpen);

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

  const handleTabChange = useCallback((key: TabType) => {
    if (key === activeTab) return;
    setActiveTab(key);
  }, [activeTab]);

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
    handleTabChange(tabs[nextIndex].key);
  };

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
    if (!e.touches.length) return;
    if (animationRef.current) animationRef.current.stop();
    startXRef.current = e.touches[0].clientX;
    startTimeRef.current = Date.now();
    isDraggingRef.current = true;
    justSwipedRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingRef.current || containerWidth === 0 || !e.touches.length) return;
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

    const endX = e.changedTouches[0]?.clientX;
    if (endX === undefined) {
      isDraggingRef.current = false;
      return;
    }
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
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setCurrentImageIndex((prev) =>
        prev < product.images.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setLightboxOpen(true);
    }
  }, [product.images.length]);

  const handleLightboxPrev = useCallback(() => {
    setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : prev));
  }, []);

  const handleLightboxNext = useCallback(() => {
    setCurrentImageIndex((prev) =>
      prev < product.images.length - 1 ? prev + 1 : prev
    );
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

  const handleOfficialBuy = useCallback(async () => {
    if (buying) return;
    if (!user) {
      openLoginModal();
      return;
    }
    if (product.stock <= 0) {
      showError("商品已售罄");
      return;
    }
    setBuying(true);
    try {
      const result = await addToCart(product.id, 1);
      if (result) {
        trackEvent("add_to_cart", {
          currency: "CNY",
          value: product.price,
          items: [
            {
              item_id: product.id,
              item_name: product.name,
              price: product.price,
              quantity: 1,
            },
          ],
        });
        success("已加入购物车");
      } else {
        showError("添加失败，请重试");
      }
    } catch {
      showError("网络错误，请重试");
    } finally {
      setBuying(false);
    }
  }, [buying, user, openLoginModal, product.id, product.stock, addToCart, success, showError]);

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
              ? "ring-1 ring-brand-charcoal"
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

  // 外部购买链接（不含官网直购按钮，桌面/移动端共用）
  const renderExternalPurchaseLinks = () =>
    product.purchaseLinks && product.purchaseLinks.length > 0 ? (
      product.purchaseLinks
        .filter((link) => link.platform !== "官方商城")
        .map((link) => (
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
        <span className="text-sm font-light text-brand-charcoal/50">
          暂无购买链接
        </span>
      )
    );

  // 移动端是否展示外部购买链接区域（官网直购已有底部固定栏，此处只补外部渠道）
  const showMobilePurchaseLinks =
    (product.purchaseLinks && product.purchaseLinks.length > 0) ||
    !!product.purchaseUrl ||
    !product.allowDirectBuy;

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
      className="relative flex min-h-dvh flex-col bg-[#fefcf8]"
    >
      <style jsx global>{`
        html {
          scroll-padding-bottom: 120px;
        }
      `}</style>

      {/* 矿物纹理叠加层（仅PC端） */}
      <div
        className="pointer-events-none absolute inset-0 z-0 hidden opacity-[0.04] lg:block"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* 固定顶栏导航 */}
      <nav
        aria-label="产品页导航"
        className="fixed left-0 right-0 top-0 z-50 flex w-full items-center bg-[#fefcf8]/80 px-6 py-6 backdrop-blur-md md:grid md:grid-cols-[160px_1fr_160px] md:px-20"
        style={{ pointerEvents: "none" }}
      >
        <div
          className="relative flex w-full items-center justify-center md:contents"
          style={{ pointerEvents: "auto" }}
        >
          {/* Logo */}
          <Link href="/">
            <div className="relative h-[30px] w-[107px] md:h-[40px] md:w-[160px]">
              <Image
                src="/images/NIHPLOD-logo.svg"
                alt="NIHPLOD"
                fill
                className="object-contain object-center md:object-left"
                priority
              />
            </div>
          </Link>

          {/* 桌面端分类导航 */}
          <div className="hidden items-center justify-center gap-1 md:flex">
            {categories.map((cat) => {
              const catProduct = navProducts.find((p) => p.categoryId === cat.id);
              if (!catProduct) return null;
              return (
                <Link
                  key={cat.id}
                  href={`/products/${catProduct.slug}`}
                  className="group relative px-3 py-2 text-[15px] font-light tracking-[0.15em] text-brand-charcoal transition-colors duration-500 hover:text-brand-charcoal-light"
                >
                  {cat.name}
                  <span className="absolute bottom-1 left-1/2 h-[1px] w-0 -translate-x-1/2 bg-current transition-all duration-500 group-hover:w-[calc(100%-1.5rem)]" />
                </Link>
              );
            })}
          </div>

          {/* 桌面端返回产品页按钮 */}
          <div className="hidden items-center justify-end md:flex">
            <Link
              href="/products"
              className="group relative inline-flex items-center gap-2 px-3 py-2 text-[15px] font-light tracking-[0.15em] text-brand-charcoal transition-colors duration-500 hover:text-brand-charcoal-light"
            >
              <ChevronLeft className="h-4 w-4" />
              返回产品页
              <span className="absolute bottom-1 left-1/2 h-[1px] w-0 -translate-x-1/2 bg-current transition-all duration-500 group-hover:w-[calc(100%-1.5rem)]" />
            </Link>
          </div>

          {/* 手机端汉堡菜单按钮 */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="absolute left-0 flex h-10 w-10 items-center justify-center md:hidden"
            aria-label="打开菜单"
            aria-expanded={mobileMenuOpen}
            aria-controls="product-detail-nav-panel"
          >
            <Menu className="h-5 w-5 text-brand-charcoal" />
          </button>
        </div>
      </nav>

      {/* 手机端滑出菜单面板 */}
      <div
        id="product-detail-nav-panel"
        ref={mobileTrapRef}
        role="dialog"
        aria-modal={mobileMenuOpen}
        aria-label="导航菜单"
        className={`fixed inset-0 z-[100] transition-all duration-500 md:hidden ${mobileMenuOpen ? "visible opacity-100" : "invisible opacity-0"}`}
      >
        <div
          className="absolute inset-0 bg-brand-charcoal/20 backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        />
        <div
          className={`absolute left-0 top-0 h-full w-[min(300px,80vw)] transform rounded-r-3xl bg-[#fefcf8] pb-[calc(1.25rem+env(safe-area-inset-bottom,16px))] pt-[calc(1.25rem+env(safe-area-inset-top,0px))] shadow-2xl transition-transform duration-500 ease-out ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex h-full flex-col px-6">
            {/* Logo + 关闭按钮同行 */}
            <div className="mb-8 flex items-center justify-between rounded-xl px-4 py-4">
              <Link href="/" onClick={() => setMobileMenuOpen(false)}>
                <div className="relative h-[30px] w-[107px]">
                  <Image
                    src="/images/NIHPLOD-logo.svg"
                    alt="NIHPLOD"
                    fill
                    className="object-contain object-left"
                  />
                </div>
              </Link>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-brand-charcoal/5"
                aria-label="关闭菜单"
              >
                <X className="h-5 w-5 text-brand-charcoal" strokeWidth={1.5} />
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-2 overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {categories.map((cat) => {
                const catProduct = navProducts.find((p) => p.categoryId === cat.id);
                if (!catProduct) return null;
                return (
                  <Link
                    key={cat.id}
                    href={`/products/${catProduct.slug}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex h-12 items-center rounded-xl px-4 text-[15px] font-light tracking-[0.08em] text-brand-charcoal transition-colors active:bg-brand-charcoal/5"
                  >
                    {cat.name}
                  </Link>
                );
              })}
            </div>

            <Link
              href="/products"
              onClick={() => setMobileMenuOpen(false)}
              className="mt-8 flex h-12 items-center gap-2 rounded-xl px-4 text-[15px] font-light tracking-[0.08em] text-brand-charcoal transition-colors active:bg-brand-charcoal/5"
            >
              <Home className="h-5 w-5" />
              返回产品页
            </Link>
          </div>
        </div>
      </div>

      {/* 固定顶栏占位 */}
      <div className="h-[88px] shrink-0 md:h-[88px]" />

      <div className="relative z-10 flex flex-1 flex-col pb-24 lg:w-[80%] lg:mx-auto lg:justify-center lg:pb-8">

        {/* 内容区域（全局布局已提供 <main>，此处使用 div 避免嵌套 main 地标） */}
        <div className="relative w-full lg:flex lg:items-center lg:justify-center">
          <div className="w-full scroll-smooth overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] lg:overflow-visible [&::-webkit-scrollbar]:hidden">
            <div className="lg:grid lg:grid-cols-[4fr_6fr] lg:gap-12">
              {/* 左侧：图片轮播区域 */}
              <div className="px-6 pt-6 lg:flex lg:min-w-0 lg:flex-col lg:justify-center lg:overflow-y-auto lg:px-0 lg:pb-8">
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
                        aria-label={`${product.name} 图片轮播，共 ${product.images.length} 张，回车查看大图，左右方向键切换`}
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
                            <div key={img.id} className="relative h-full w-full flex-shrink-0" role="group" aria-roledescription="slide" aria-label={`第 ${index + 1} 张，共 ${product.images.length} 张`}>
                              <Image
                                src={img.url}
                                alt={img.alt || `${product.name} 图片 ${index + 1}`}
                                fill
                                priority={index === 0}
                                loading={index === 0 ? undefined : "lazy"}
                                className="object-cover"
                                sizes="(max-width: 1024px) 100vw, 512px"
                              />
                            </div>
                          ))}
                        </m.div>

                        {/* 移动端细线指示器（图片内部） */}
                        {product.images.length > 1 && (
                          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 lg:hidden">
                            {product.images.map((_, index) => (
                              <button
                                key={index}
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setCurrentImageIndex(index); }}
                                className={cn(
                                  "h-[2px] rounded-full border-none p-0 transition-all duration-300",
                                  currentImageIndex === index
                                    ? "w-5 bg-white"
                                    : "w-3 bg-white/40"
                                )}
                                aria-label={`查看第 ${index + 1} 张图片`}
                                aria-current={currentImageIndex === index ? "true" : undefined}
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      {/* PC端圆点指示器 */}
                      {product.images.length > 1 && (
                        <div className="mt-7 hidden items-center justify-center gap-2 lg:flex">
                          {product.images.map((_, index) => (
                            <button
                              key={index}
                              type="button"
                              onClick={() => setCurrentImageIndex(index)}
                              className={cn(
                                "h-2 w-6 rounded-full border-none p-0 transition-all duration-300",
                                currentImageIndex === index
                                  ? "scale-110 bg-brand-charcoal"
                                  : "bg-brand-charcoal/20"
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
              <div className="pt-8 lg:min-w-0 lg:overflow-y-auto lg:py-8 lg:pt-0">
                <div className="mx-auto max-w-2xl px-6 sm:px-0">
                  {/* 产品信息 */}
                  <m.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                  >
                  {/* 产品名称 + 操作按钮 */}
                  <div className="flex items-center justify-between gap-3">
                    <h1 className="font-serif text-[20px] text-brand-charcoal max-lg:font-light max-lg:tracking-[0.15em] max-lg:text-brand-charcoal sm:text-[24px] lg:text-[28px]">
                      {product.name}
                    </h1>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={handleShare}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-brand-charcoal/60 transition-colors hover:bg-brand-beige hover:text-brand-charcoal md:h-11 md:w-11"
                        aria-label="分享"
                      >
                        <Share2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* 产地/规格 */}
                  {(product.origin || product.capacity) && (
                    <dl className="mt-2 flex items-center gap-3 text-xs font-light leading-relaxed tracking-[0.06em] text-brand-charcoal">
                      {product.origin && (
                        <div className="flex gap-0">
                          <dt>产地：</dt>
                          <dd>{product.origin}</dd>
                        </div>
                      )}
                      {product.capacity && (
                        <div className="flex gap-0">
                          <dt>规格：</dt>
                          <dd>{product.capacity}</dd>
                        </div>
                      )}
                    </dl>
                  )}

                  {/* 价格 */}
                  <div className="mt-4">
                    <data
                      value={product.price}
                      className="text-lg font-light tracking-[0.12em] text-brand-charcoal max-lg:text-brand-charcoal"
                    >
                      {formatPrice(product.price)}
                    </data>
                  </div>

                  {/* 功效标签 */}
                  {product.benefits.length > 0 && (
                    <ul className="mt-6 flex flex-wrap gap-2">
                      {product.benefits.map((benefit, index) => (
                        <li
                          key={index}
                          className="rounded-full border border-brand-beige bg-[#FBF8F0] px-3 py-1 text-[13px] font-light tracking-[0.06em] text-brand-charcoal md:text-sm"
                        >
                          {benefit}
                        </li>
                      ))}
                    </ul>
                  )}
                </m.div>

                {/* Tab 区域 */}
                <div className="py-8">
                  {/* Tab 切换 */}
                  <div className="border-b border-brand-beige">
                    <div className="flex justify-start gap-6" role="tablist" aria-label="产品信息">
                      {tabs.map((tab) => (
                        <button
                          key={tab.key}
                          type="button"
                          role="tab"
                          id={`tab-${tab.key}`}
                          aria-selected={activeTab === tab.key}
                          aria-controls={`panel-${tab.key}`}
                          tabIndex={activeTab === tab.key ? 0 : -1}
                          onClick={() => handleTabChange(tab.key)}
                          onKeyDown={handleTabKeyDown}
                          className={cn(
                            "relative cursor-pointer pb-3 text-[13px] tracking-[0.08em] transition-colors md:text-sm md:tracking-[0.12em]",
                            activeTab === tab.key
                              ? "font-normal text-brand-charcoal"
                              : "font-light text-brand-charcoal hover:opacity-70"
                          )}
                        >
                          {tab.label}
                          {activeTab === tab.key && (
                            <m.div
                              className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00263e]"
                              layoutId="tab-indicator"
                            />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Tab 内容 - 所有面板叠放在同一 grid 格子中，容器高度恒为最高面板，切换时不抖动 */}
                  <div className="mt-6 grid">
                    {tabs.map((tab) => {
                      const isActive = activeTab === tab.key;
                      return (
                        <div
                          key={tab.key}
                          role="tabpanel"
                          id={`panel-${tab.key}`}
                          aria-labelledby={`tab-${tab.key}`}
                          aria-hidden={!isActive}
                          tabIndex={isActive ? 0 : -1}
                          className={cn(
                            "col-start-1 row-start-1 transition-opacity duration-300",
                            isActive ? "opacity-100" : "pointer-events-none invisible opacity-0"
                          )}
                        >
                          {tabContent[tab.key] ? (
                            <div
                              className="text-left text-[14px] font-light leading-[1.8] tracking-[0.06em] text-brand-charcoal/90 md:text-base md:tracking-[0.08em] [&_p+p]:mt-3"
                              dangerouslySetInnerHTML={{
                                __html: DOMPurify.sanitize(tabContent[tab.key]!),
                              }}
                            />
                          ) : (
                            <p className="text-base font-light text-brand-charcoal/40">暂无内容</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 小红书链接 */}
                <XiaohongshuLink
                  categoryName={product.category.name}
                  className="flex flex-col gap-1 pb-6 lg:pb-7"
                />

                {/* 购买按钮区域 - 桌面端内联 */}
                <div className="pb-6 max-lg:hidden">
                  {/* 外部购买链接 - 图标形式 */}
                  <div className="flex flex-wrap items-center justify-start gap-4">
                    {product.allowDirectBuy && (
                      <button
                        type="button"
                        onClick={handleOfficialBuy}
                        disabled={buying}
                        aria-label="官网购买"
                        className="-m-2 inline-flex min-h-[44px] min-w-[44px] items-center justify-center p-2 transition-opacity hover:opacity-60 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="text-xs font-normal tracking-[0.12em] text-brand-charcoal">
                          {buying ? "加入中…" : "官网"}
                        </span>
                      </button>
                    )}
                    {renderExternalPurchaseLinks()}
                    </div>
                  </div>

                {/* 购买链接区域 - 移动端（外部渠道，官网直购见底部固定栏） */}
                {showMobilePurchaseLinks && (
                  <div className="pb-6 lg:hidden">
                    <div className="flex flex-wrap items-center justify-start gap-4">
                      {renderExternalPurchaseLinks()}
                    </div>
                  </div>
                )}

                  {/* 肌智派素颜测肤推广 */}
                  <div className="pb-6 lg:pb-7">
                    <AdvisorCTA variant="guide" />
                  </div>
                </div>

                {/* 相关产品推荐 */}
                {relatedProducts.length > 0 && (
                  <div className="mx-auto mt-8 w-full max-w-4xl border-t border-brand-beige px-6 pt-8 sm:px-0 pb-24">
                    <h2 className="mb-6 text-center font-serif text-xl text-brand-charcoal max-lg:font-light max-lg:tracking-[0.15em] max-lg:text-brand-charcoal">
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
          <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-brand-charcoal/10 bg-[#fefcf8]/95 px-6 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 backdrop-blur-md lg:hidden">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleOfficialBuy}
                disabled={buying}
                className="flex-1 rounded-lg border border-brand-primary bg-transparent py-3 text-center text-sm font-light tracking-[0.08em] text-brand-primary transition-colors hover:bg-brand-primary/5 active:opacity-80 disabled:cursor-not-allowed disabled:opacity-60 lg:tracking-[0.12em]"
              >
                {buying ? "加入中…" : "官网购买"}
              </button>
              <button
                type="button"
                onClick={handleOfficialBuy}
                disabled={buying}
                aria-label="购物车"
                className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-lg border border-brand-charcoal/15 text-brand-charcoal/70 transition-colors active:bg-brand-charcoal/5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ShoppingCart className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        )}

      </div>

      {/* 底部版权信息 */}
      <footer className="mt-auto md:border-t md:border-brand-charcoal/10">
        <div className={cn("container mx-auto px-6 py-6 text-center md:px-8 lg:px-12 xl:px-16", product.allowDirectBuy ? "max-lg:pb-[calc(5.75rem+env(safe-area-inset-bottom))]" : "max-lg:pb-6")}>
          <div className="flex items-center justify-center gap-3">
            <span className="text-[11px] font-light tracking-[0.08em] text-brand-charcoal/[0.48] md:tracking-[0.15em]">
              &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
            </span>
            <span className="text-[11px] font-light text-brand-charcoal/20">|</span>
            {/* 移动端：点击弹出模态框 */}
            <button
              type="button"
              onClick={() => setQrModalOpen(true)}
              className="text-[11px] font-light tracking-[0.08em] text-brand-charcoal/[0.48] transition-colors active:text-brand-charcoal/70 md:hidden"
            >
              服务号
            </button>
            {/* PC端：hover 显示 */}
            <div className="group relative hidden cursor-pointer md:inline-flex">
              <span className="text-[11px] font-light tracking-[0.15em] text-brand-charcoal/[0.48] transition-colors group-hover:text-brand-charcoal/70">服务号</span>
              <Image
                src="/images/wechat-qrcode.jpg"
                alt="NIHPLOD 微信服务号"
                width={160}
                height={160}
                unoptimized
                className="absolute bottom-full left-1/2 z-50 mb-2 hidden h-auto w-40 -translate-x-1/2 rounded-lg bg-white p-2 shadow-lg group-hover:block"
              />
            </div>
          </div>
        </div>
      </footer>

      {/* 移动端二维码模态框 */}
      <AnimatePresence>
        {qrModalOpen && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-brand-charcoal/30 backdrop-blur-sm md:hidden"
            onClick={() => setQrModalOpen(false)}
          >
            <m.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="mx-6 flex flex-col items-center rounded-2xl bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src="/images/wechat-qrcode.jpg"
                alt="NIHPLOD 微信服务号"
                width={200}
                height={200}
                unoptimized
                className="h-[200px] w-[200px] rounded-lg"
              />
              <p className="mt-4 text-[13px] font-light tracking-[0.06em] text-brand-charcoal/60">
                扫码关注 NIHPLOD 服务号
              </p>
              <button
                type="button"
                onClick={() => setQrModalOpen(false)}
                className="mt-4 flex h-8 w-8 items-center justify-center rounded-full transition-colors active:bg-brand-charcoal/5"
                aria-label="关闭"
              >
                <X className="h-4 w-4 text-brand-charcoal/40" strokeWidth={1.5} />
              </button>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>

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
            trapRef={lightboxTrapRef}
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
  trapRef,
}: {
  images: ProductImage[];
  productName: string;
  currentIndex: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  trapRef: React.RefObject<HTMLDivElement | null>;
}) {
  const currentImage = images[currentIndex];
  if (!currentImage) return null;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < images.length - 1;
  const imgAlt = currentImage.alt || `${productName} 图片 ${currentIndex + 1}`;

  return (
    <m.div
      ref={trapRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${imgAlt} — 第 ${currentIndex + 1} 张，共 ${images.length} 张`}
    >
      {/* 关闭按钮 */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute right-4 top-4 z-10 inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20"
        aria-label="关闭图片预览"
      >
        <X className="h-6 w-6" />
      </button>

      {/* 上一张 */}
      {hasPrev && (
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
        className="relative flex max-h-[90vh] w-full max-w-4xl items-center justify-center px-4"
        onClick={(e) => e.stopPropagation()}
      >
        <Image
          key={currentImage.id}
          src={currentImage.url}
          alt={imgAlt}
          width={2048}
          height={2048}
          className="max-h-[90vh] h-auto w-auto max-w-full object-contain"
          sizes="100vw"
          priority
        />
      </div>

      {/* 下一张 */}
      {hasNext && (
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
