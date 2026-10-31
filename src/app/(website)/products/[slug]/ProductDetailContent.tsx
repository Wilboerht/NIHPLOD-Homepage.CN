"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import NextLink from "next/link";
import { sanitizeHtml } from "@/lib/html-sanitize";
import { m, AnimatePresence, useMotionValue, animate } from "framer-motion";
import { ChevronLeft, ChevronRight, HelpCircle, Share2, X } from "lucide-react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useMounted } from "@/hooks/useMounted";
import { ProductCard, PlatformIcon, XiaohongshuLink, AdvisorCTA } from "@/components/website";
import { ProductFaq } from "@/components/website/ProductFaq";
import { useProductsShell } from "@/components/website/ProductsShell";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { useToast } from "@/components/ui/Toast";

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
  purchaseLinks: { id: string; platform: string; platformKey?: string | null; url: string }[];
  category: Category;
  images: ProductImage[];
  ingredients: string | null;
  usage: string | null;
  benefits: string[];
  origin?: string | null;
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
  faqs: { question: string; answer: string }[];
}

type TabType = "description" | "ingredients" | "usage";

export function ProductDetailContent({
  product,
  relatedProducts,
  faqs,
}: ProductDetailContentProps) {
  const { success } = useToast();
  const { navigateToList, navigateToProduct } = useProductsShell();
  const mounted = useMounted();

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

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<TabType>("description");
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const faqScrollRef = useRef<HTMLDivElement>(null);
  const faqButtonRef = useRef<HTMLButtonElement>(null);
  const faqBackRef = useRef<HTMLButtonElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [prevProductId, setPrevProductId] = useState(product.id);
  if (prevProductId !== product.id) {
    setPrevProductId(product.id);
    setCurrentImageIndex(0);
    setActiveTab("description");
    setLightboxOpen(false);
    setFaqOpen(false);
  }

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

  const lightboxTrapRef = useFocusTrap(lightboxOpen);

  const tabContent: Record<TabType, string | null> = {
    description: product.description,
    ingredients: product.ingredients,
    usage: product.usage,
  };

  const tabs: { key: TabType; label: string }[] = (
    [
      { key: "description", label: "产品描述" },
      { key: "ingredients", label: "成分说明" },
      { key: "usage", label: "使用方法" },
    ] as { key: TabType; label: string }[]
  ).filter((tab) => Boolean(tabContent[tab.key]?.trim()));

  const activeTabKey = tabs.some((tab) => tab.key === activeTab)
    ? activeTab
    : (tabs[0]?.key ?? "description");

  const formattedPrice = new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(product.price);

  const handleTabChange = useCallback(
    (key: TabType) => {
      if (key === activeTabKey) return;
      setActiveTab(key);
    },
    [activeTabKey]
  );

  const handleTabKeyDown = (e: React.KeyboardEvent) => {
    const currentIndex = tabs.findIndex((t) => t.key === activeTabKey);
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
      return;
    }
    const diff = startXRef.current - endX;
    const duration = Date.now() - startTimeRef.current;
    const velocity = Math.abs(diff) / Math.max(duration, 1);

    const SWIPE_THRESHOLD = 50;
    const VELOCITY_THRESHOLD = 0.5;

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

  const handleMainImageKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : prev));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setCurrentImageIndex((prev) => (prev < product.images.length - 1 ? prev + 1 : prev));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setLightboxOpen(true);
      }
    },
    [product.images.length]
  );

  const handleLightboxPrev = useCallback(() => {
    setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : prev));
  }, []);

  const handleLightboxNext = useCallback(() => {
    setCurrentImageIndex((prev) => (prev < product.images.length - 1 ? prev + 1 : prev));
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

  const openFaq = useCallback(() => {
    setFaqOpen(true);
    requestAnimationFrame(() => {
      faqScrollRef.current?.scrollTo({ top: 0 });
      faqBackRef.current?.focus();
    });
  }, []);

  const closeFaq = useCallback(() => {
    setFaqOpen(false);
    requestAnimationFrame(() => {
      faqButtonRef.current?.focus();
    });
  }, []);

  const handleRelatedClick = (e: React.MouseEvent<HTMLAnchorElement>, slug: string) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    e.preventDefault();
    navigateToProduct(slug);
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
          onClick={() => setCurrentImageIndex(index)}
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

  const renderExternalPurchaseLinks = () =>
    product.purchaseLinks && product.purchaseLinks.length > 0 ? (
      product.purchaseLinks.map((link) => (
        <a
          key={link.id}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`在${link.platform}购买`}
          className="-m-2 inline-flex min-h-[44px] items-center justify-center gap-2 p-2 text-sm text-brand-charcoal transition-opacity hover:opacity-60"
        >
          <PlatformIcon platform={link.platform} platformKey={link.platformKey} />
        </a>
      ))
    ) : (
      <span className="text-sm font-light text-brand-charcoal/50">暂无购买链接</span>
    );

  return (
    <div data-product-detail className="relative h-full min-h-0">
      <div
        aria-hidden={faqOpen}
        inert={faqOpen}
        className={cn(
          "scrollbar-hide h-full overflow-y-auto overscroll-contain transition-opacity duration-300",
          faqOpen ? "pointer-events-none opacity-0" : "opacity-100"
        )}
      >
        <div className="mx-auto w-full max-w-[1920px] px-6 pb-6 pt-6 lg:pl-[51px] lg:pr-10 xl:pl-[calc(8%_+_11px)] xl:pr-[8%]">
          <nav
            aria-label="面包屑"
            className="mb-5 flex flex-wrap items-center gap-1.5 text-[12px] font-light tracking-[0.06em] text-brand-charcoal/50"
          >
            <button
              type="button"
              onClick={navigateToList}
              className="transition-colors hover:text-brand-charcoal"
            >
              产品
            </button>
            <ChevronRight className="h-3 w-3 opacity-50" aria-hidden="true" />
            <span aria-current="page" className="text-brand-charcoal/70">
              {product.category.name}
            </span>
          </nav>

          <div className="lg:grid lg:grid-cols-[4fr_6fr] lg:gap-12 xl:gap-16">
            <div className="lg:sticky lg:top-2 lg:self-start">
              <div className="w-full lg:max-w-lg lg:pt-[3px]">
                <div className="flex flex-col gap-4 lg:flex-row lg:gap-4">
                  {product.images.length > 1 && (
                    <div className="order-2 hidden lg:order-1 lg:block">
                      {renderThumbnails("vertical")}
                    </div>
                  )}

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
                          <div
                            key={img.id}
                            className="relative h-full w-full flex-shrink-0"
                            role="group"
                            aria-roledescription="slide"
                            aria-label={`第 ${index + 1} 张，共 ${product.images.length} 张`}
                          >
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

                      {product.images.length > 1 && (
                        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 lg:hidden">
                          {product.images.map((_, index) => (
                            <button
                              key={index}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCurrentImageIndex(index);
                              }}
                              className={cn(
                                "h-[2px] rounded-full border-none p-0 transition-all duration-300",
                                currentImageIndex === index ? "w-5 bg-white" : "w-3 bg-white/40"
                              )}
                              aria-label={`查看第 ${index + 1} 张图片`}
                              aria-current={currentImageIndex === index ? "true" : undefined}
                            />
                          ))}
                        </div>
                      )}
                    </div>

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

                    <div className="sr-only" aria-live="polite" aria-atomic="true">
                      当前显示第 {currentImageIndex + 1} 张图片，共 {product.images.length} 张
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-8 lg:min-w-0 lg:pt-0">
              <div className="mx-auto max-w-2xl lg:mx-0">
                <m.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h1 className="font-serif text-[20px] font-normal tracking-[0.05em] text-brand-charcoal sm:text-[22px] lg:text-[28px]">
                      {product.name}
                    </h1>
                    <div className="flex items-center gap-1">
                      {faqs.length > 0 && (
                        <button
                          ref={faqButtonRef}
                          type="button"
                          onClick={openFaq}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-brand-charcoal/60 transition-colors hover:bg-brand-beige hover:text-brand-charcoal md:h-11 md:w-11"
                          aria-label="常见问题"
                          title="常见问题"
                        >
                          <HelpCircle className="h-5 w-5" />
                        </button>
                      )}
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

                  <p className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-normal leading-relaxed tracking-[0.02em] text-brand-charcoal/[0.85]">
                    <span>
                      <span className="tracking-[0.06em] text-brand-charcoal/60">产地</span>{" "}
                      {product.origin || "法国"}
                    </span>
                    {product.capacity && (
                      <>
                        <span className="text-brand-charcoal/30" aria-hidden="true">
                          ·
                        </span>
                        <span>
                          <span className="tracking-[0.06em] text-brand-charcoal/60">规格</span>{" "}
                          {product.capacity}
                        </span>
                      </>
                    )}
                  </p>

                  <div className="mt-4">
                    <data
                      value={product.price}
                      className="inline-flex items-baseline gap-1 text-brand-charcoal"
                    >
                      <span className="text-[15px] font-normal text-brand-charcoal/60">¥</span>
                      <span className="font-num text-[22px] font-medium tabular-nums tracking-[0.01em]">
                        {formattedPrice}
                      </span>
                    </data>
                  </div>

                  {product.benefits.length > 0 && (
                    <ul className="mt-4 flex flex-wrap gap-2">
                      {product.benefits.map((benefit, index) => (
                        <li
                          key={index}
                          className="inline-flex items-center rounded-full border border-brand-charcoal/[0.08] bg-white/50 px-3 py-1.5 text-[12px] font-normal tracking-[0.04em] text-brand-charcoal/80 md:text-[13px]"
                        >
                          {benefit}
                        </li>
                      ))}
                    </ul>
                  )}

                  <XiaohongshuLink
                    categoryName={product.category.name}
                    className="mt-4 flex flex-col gap-1"
                  />
                </m.div>

                <div className="mt-6 rounded-2xl border border-brand-charcoal/[0.06] bg-[#FFFDF9] p-4 md:p-5 lg:p-6">
                  <div className="border-b border-brand-beige">
                    <div className="flex justify-start gap-6" role="tablist" aria-label="产品信息">
                      {tabs.map((tab) => (
                        <button
                          key={tab.key}
                          type="button"
                          role="tab"
                          id={`tab-${tab.key}`}
                          aria-selected={activeTabKey === tab.key}
                          aria-controls={`panel-${tab.key}`}
                          tabIndex={activeTabKey === tab.key ? 0 : -1}
                          onClick={() => handleTabChange(tab.key)}
                          onKeyDown={handleTabKeyDown}
                          className={cn(
                            "relative cursor-pointer pb-3 text-[13px] font-medium tracking-[0.04em] transition-colors md:text-[14px]",
                            activeTabKey === tab.key
                              ? "text-brand-charcoal"
                              : "text-brand-charcoal/65 hover:text-brand-charcoal/85"
                          )}
                        >
                          {tab.label}
                          {activeTabKey === tab.key && (
                            <m.div
                              className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-charcoal"
                              layoutId="tab-indicator"
                            />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5 grid">
                    {tabs.map((tab) => {
                      const isActive = activeTabKey === tab.key;
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
                              className="text-left text-[14px] font-normal leading-[1.85] tracking-[0.02em] text-brand-charcoal/90 [&_a]:text-brand-primary [&_a]:underline [&_a]:underline-offset-2 [&_li+_li]:mt-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-4 [&_strong]:font-medium [&_strong]:text-brand-charcoal [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5"
                              dangerouslySetInnerHTML={{
                                __html: sanitizeHtml(tabContent[tab.key]!),
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

                <div className="mt-6">
                  <div className="flex flex-wrap items-center justify-start gap-4">
                    {renderExternalPurchaseLinks()}
                  </div>

                  <div className="mt-4 pb-6 lg:pb-7">
                    <AdvisorCTA variant="guide" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {relatedProducts.length > 0 && (
            <section className="mx-auto mt-10 w-full max-w-4xl border-t border-brand-beige pt-8">
              <h2 className="mb-6 text-center font-serif text-xl text-brand-charcoal max-lg:font-light max-lg:tracking-[0.15em]">
                相关推荐
              </h2>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {relatedProducts.map((rp) => (
                  <NextLink
                    key={rp.id}
                    href={`/products/${rp.slug}`}
                    onClick={(e) => handleRelatedClick(e, rp.slug)}
                  >
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
                  </NextLink>
                ))}
              </div>
            </section>
          )}

          <footer className="mx-auto mt-8 w-full max-w-4xl border-t border-brand-beige/70 pt-6 text-center">
            <span className="text-[11px] font-light tracking-[0.08em] text-brand-charcoal/[0.48] md:tracking-[0.15em]">
              &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
            </span>
          </footer>
        </div>
      </div>

      {faqs.length > 0 && (
        <div
          ref={faqScrollRef}
          aria-hidden={!faqOpen}
          inert={!faqOpen}
          className={cn(
            "scrollbar-hide absolute inset-0 z-20 h-full overflow-y-auto overscroll-contain bg-brand-cream transition-opacity duration-300",
            faqOpen ? "opacity-100" : "pointer-events-none opacity-0"
          )}
        >
          <div className="mx-auto w-full max-w-[1920px] px-6 pb-6 pt-6 lg:pl-[51px] lg:pr-10 xl:pl-[calc(8%_+_11px)] xl:pr-[8%]">
            <div className="mb-2 flex items-center">
              <button
                ref={faqBackRef}
                type="button"
                onClick={closeFaq}
                className="inline-flex items-center gap-1.5 py-2 text-[13px] font-normal tracking-[0.04em] text-brand-charcoal/60 transition-colors hover:text-brand-charcoal"
              >
                <ChevronLeft className="h-4 w-4" />
                返回产品详情
              </button>
            </div>
            <ProductFaq
              faqs={faqs}
              title={`${product.category.name} · 为您解答`}
              className="mt-2 w-full border-t-0 px-0 pb-0 pt-0"
            />
          </div>
        </div>
      )}

      {mounted &&
        createPortal(
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
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}

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
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/95"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${imgAlt} — 第 ${currentIndex + 1} 张，共 ${images.length} 张`}
    >
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
          className="h-auto max-h-[90vh] w-auto max-w-full object-contain"
          sizes="100vw"
          priority
        />
      </div>

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

      <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full bg-white/10 px-4 py-1.5 text-sm text-white backdrop-blur-md">
        {currentIndex + 1} / {images.length}
      </div>
    </m.div>
  );
}
