"use client";

import { useEffect, useLayoutEffect, useRef, type UIEvent, type KeyboardEvent } from "react";
import Image from "next/image";
import NextLink from "next/link";
import { m, AnimatePresence } from "framer-motion";
import { ChevronRight, ShoppingBag, LayoutGrid } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { getCategoryIconPath } from "@/lib/product-icons";
import { trackEvent } from "@/lib/analytics";
import { useProductsShell, type ProductsCategory } from "@/components/website/ProductsShell";

interface Product {
  id: string;
  name: string;
  slug: string;
  price: number;
  capacity: string | null;
  category: { name: string };
  images: { url: string; alt: string | null }[];
}

interface ProductsContentProps {
  categories: ProductsCategory[];
  products: Product[];
}

/**
 * 产品列表视图
 * 抽屉容器与顶部导航由 products/layout.tsx 中的 ProductsShell 提供。
 */
export function ProductsContent({ categories, products }: ProductsContentProps) {
  const {
    activeTab,
    mobileView,
    showAllProducts,
    switchMobileView,
    navigateToProduct,
    listScrollTopRef,
  } = useProductsShell();

  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const desktopScrollRef = useRef<HTMLElement>(null);
  const fadeMaskRef = useRef<HTMLDivElement>(null);
  const bottomFadeMaskRef = useRef<HTMLDivElement>(null);
  const tabButtonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const previousFiltersRef = useRef({ mobileView, activeTab });

  // GA: view_item_list 事件
  useEffect(() => {
    if (products.length > 0) {
      trackEvent("view_item_list", {
        item_list_id: "products",
        item_list_name: "产品列表",
        items: products.map((p) => ({
          item_id: p.id,
          item_name: p.name,
          price: p.price,
          item_category: p.category?.name,
        })),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.length]);

  // 挑选主推的3个产品
  const featuredProducts = products.slice(0, 3);
  const listTitle = activeTab === "featured" ? "当季热卖" : "全部产品";
  const productTabLabel = listTitle;
  const visibleProducts = activeTab === "featured" ? featuredProducts : products;

  // 上下渐隐遮罩状态评估：滚动中/触底/内容不溢出均正确
  const updateFadeMasks = () => {
    const el = mobileScrollRef.current;
    if (!el) return;
    const scrolled = el.scrollTop > 8;
    if (fadeMaskRef.current) fadeMaskRef.current.style.opacity = scrolled ? "1" : "0";
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
    if (bottomFadeMaskRef.current) bottomFadeMaskRef.current.style.opacity = atBottom ? "0" : "1";
  };

  // 视图切换/数据变化后重新评估，保证短内容初始状态正确
  useEffect(() => {
    const raf = requestAnimationFrame(updateFadeMasks);
    return () => cancelAnimationFrame(raf);
  }, [mobileView, activeTab, products.length, categories.length]);

  // 从详情返回列表时恢复滚动位置
  useLayoutEffect(() => {
    const scrollTop = listScrollTopRef.current;
    if (scrollTop <= 0) return;

    const applyScroll = () => {
      const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
      if (isDesktop) {
        if (desktopScrollRef.current) desktopScrollRef.current.scrollTop = scrollTop;
      } else if (mobileScrollRef.current) {
        mobileScrollRef.current.scrollTop = scrollTop;
      }
    };

    applyScroll();
    const raf = requestAnimationFrame(applyScroll);
    return () => cancelAnimationFrame(raf);
  }, [listScrollTopRef]);

  // 切换筛选/视图时复位滚动位置（仅筛选值真正变化时执行，避免 StrictMode 首次挂载误伤）
  useEffect(() => {
    const previous = previousFiltersRef.current;
    const changed = previous.mobileView !== mobileView || previous.activeTab !== activeTab;
    previousFiltersRef.current = { mobileView, activeTab };

    if (!changed) return;

    mobileScrollRef.current?.scrollTo({ top: 0 });
    if (desktopScrollRef.current) desktopScrollRef.current.scrollTop = 0;
    listScrollTopRef.current = 0;
    updateFadeMasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobileView, activeTab]);

  // 切换移动端 Tab：同步复位滚动位置，避免新列表从半屏中间开始展示
  const handleSwitchMobileView = (view: "products" | "categories") => {
    if (view === mobileView) return;
    switchMobileView(view);
    mobileScrollRef.current?.scrollTo({ top: 0 });
    if (fadeMaskRef.current) fadeMaskRef.current.style.opacity = "0";
    if (bottomFadeMaskRef.current) bottomFadeMaskRef.current.style.opacity = "1";
  };

  // 左右方向键切换 Tab 并移动焦点（WAI-ARIA Tabs 模式）
  const handleTabKeyDown = (
    e: KeyboardEvent<HTMLButtonElement>,
    current: "products" | "categories"
  ) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = current === "products" ? "categories" : "products";
    handleSwitchMobileView(next);
    tabButtonsRef.current[next === "products" ? 0 : 1]?.focus();
  };

  const handleMobileScroll = () => {
    if (mobileScrollRef.current) {
      listScrollTopRef.current = mobileScrollRef.current.scrollTop;
    }
    updateFadeMasks();
  };

  const handleDesktopScroll = (e: UIEvent<HTMLElement>) => {
    listScrollTopRef.current = e.currentTarget.scrollTop;
  };

  const handleProductLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, productSlug: string) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    e.preventDefault();
    navigateToProduct(productSlug);
  };

  /**
   * 移动端展示层 - 抽屉内 drill-down 模式（与 FAQ 一致）
   * 以渲染函数方式调用，避免渲染期创建组件导致状态重置
   */
  const renderMobileShowcase = () => (
    <div className="flex h-full flex-col overflow-hidden bg-brand-cream lg:hidden">
      {/* 顶部 Tab 栏 - 仅在产品列表/分类列表时显示 */}
      <div className="relative z-40 shrink-0 bg-brand-cream/95 backdrop-blur-sm">
        <div className="texture-overlay absolute inset-0 z-[-1]" />
        <div
          className="flex items-center justify-center gap-3 px-6"
          role="tablist"
          aria-label="产品浏览方式"
        >
          <button
            ref={(el) => {
              tabButtonsRef.current[0] = el;
            }}
            type="button"
            role="tab"
            id="mobile-tab-products"
            aria-selected={mobileView === "products"}
            aria-controls="mobile-tabpanel-products"
            tabIndex={mobileView === "products" ? 0 : -1}
            onKeyDown={(e) => handleTabKeyDown(e, "products")}
            onClick={() => handleSwitchMobileView("products")}
            className={cn(
              "relative flex items-center gap-1.5 rounded-full px-5 py-2.5 transition-colors",
              mobileView === "products"
                ? "font-normal text-brand-primary"
                : "font-light text-brand-charcoal/40"
            )}
          >
            {mobileView === "products" && (
              <m.div
                layoutId="products-tab-pill"
                className="absolute inset-0 rounded-full border border-[#00263e]/[0.08] bg-[#00263e]/[0.04]"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <ShoppingBag size={18} strokeWidth={1.5} className="relative" />
            <span className="relative text-[12px] tracking-[0.06em]">{productTabLabel}</span>
          </button>
          <button
            ref={(el) => {
              tabButtonsRef.current[1] = el;
            }}
            type="button"
            role="tab"
            id="mobile-tab-categories"
            aria-selected={mobileView === "categories"}
            aria-controls="mobile-tabpanel-categories"
            tabIndex={mobileView === "categories" ? 0 : -1}
            onKeyDown={(e) => handleTabKeyDown(e, "categories")}
            onClick={() => handleSwitchMobileView("categories")}
            className={cn(
              "relative flex items-center gap-1.5 rounded-full px-5 py-2.5 transition-colors",
              mobileView === "categories"
                ? "font-normal text-brand-primary"
                : "font-light text-brand-charcoal/40"
            )}
          >
            {mobileView === "categories" && (
              <m.div
                layoutId="products-tab-pill"
                className="absolute inset-0 rounded-full border border-[#00263e]/[0.08] bg-[#00263e]/[0.04]"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <LayoutGrid size={18} strokeWidth={1.5} className="relative" />
            <span className="relative text-[12px] tracking-[0.06em]">产品分类</span>
          </button>
        </div>
      </div>

      {/* Scroll Area Wrapper - 渐隐遮罩 + drill-down */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* Top Fade Mask - 仅在滚动后显示，通过 ref 直接操作避免重渲染 */}
        <div
          ref={fadeMaskRef}
          className="pointer-events-none absolute inset-x-0 top-0 z-30 h-6 transition-opacity duration-300"
          style={{ background: "linear-gradient(to bottom, #FBF8F0, transparent)", opacity: 0 }}
        />

        {/* Bottom Fade Mask - 未滚到底时显示，滚到底后淡出 */}
        <div
          ref={bottomFadeMaskRef}
          className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-8 transition-opacity duration-300"
          style={{ background: "linear-gradient(to top, #FBF8F0, transparent)", opacity: 1 }}
        />

        <div
          ref={mobileScrollRef}
          onScroll={handleMobileScroll}
          className="relative z-20 flex h-full flex-col overflow-y-auto px-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <AnimatePresence mode="wait">
            {mobileView === "products" ? (
              /* --- 产品列表视图 --- */
              <m.div
                key={`product-list-${activeTab}`}
                id="mobile-tabpanel-products"
                role="tabpanel"
                aria-labelledby="mobile-tab-products"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="flex min-h-full flex-col"
              >
                {/* Title */}
                <div className="mb-8 flex flex-col items-center pt-7">
                  <h2 className="text-[19px] font-normal tracking-[0.15em] text-brand-primary">
                    {listTitle}
                  </h2>
                  <div className="mt-2 w-[70px] border-b border-brand-primary" />
                </div>

                {/* Product Cards */}
                <div className="flex flex-col gap-5">
                  {visibleProducts.map((product, idx) => (
                    <m.div
                      key={product.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + idx * 0.1, duration: 0.6, ease: "easeOut" }}
                      className="flex flex-col border border-brand-charcoal/[0.06] bg-[#FFFDF9]"
                    >
                      <NextLink
                        href={`/products/${product.slug}`}
                        onClick={(e) => handleProductLinkClick(e, product.slug)}
                        className="group relative flex w-full flex-col transition-all active:scale-[0.98]"
                      >
                        <div className="texture-overlay pointer-events-none absolute inset-0 opacity-[0.03]" />
                        <div className="relative z-10 aspect-[4/5] w-full overflow-hidden bg-brand-cream">
                          {product.capacity && (
                            <div className="absolute right-3 top-3 z-20 rounded-full bg-white/90 px-3 py-1 text-[12px] font-light text-brand-primary shadow-sm">
                              {product.capacity}
                            </div>
                          )}
                          <Image
                            src={product.images[0]?.url || ""}
                            alt={product.name}
                            fill
                            className="object-cover transition-transform duration-500 group-active:scale-105"
                            sizes="100vw"
                            priority={idx <= 1}
                          />
                        </div>
                      </NextLink>
                      <button
                        type="button"
                        onClick={() => navigateToProduct(product.slug)}
                        className="flex w-full flex-col items-start gap-1.5 px-5 pb-5 pt-4 text-left"
                      >
                        <p
                          className="line-clamp-1 text-[15px] font-light leading-[24px] tracking-[0.08em] text-brand-primary"
                          title={product.name}
                        >
                          {product.name}
                        </p>
                        <p className="text-[13px] font-light tracking-[0.08em] text-brand-primary/50">
                          {formatPrice(product.price)}
                        </p>
                      </button>
                    </m.div>
                  ))}
                </div>

                {/* Copyright */}
                <div className="mt-auto flex flex-col items-center justify-center pb-4 pt-10">
                  <p className="text-[12px] font-light tracking-[0.08em] text-brand-charcoal/[0.48]">
                    &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
                  </p>
                </div>
              </m.div>
            ) : mobileView === "categories" ? (
              /* --- 分类列表视图 --- */
              <m.div
                key="category-list"
                id="mobile-tabpanel-categories"
                role="tabpanel"
                aria-labelledby="mobile-tab-categories"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="flex min-h-full flex-col"
              >
                {/* Title */}
                <div className="mb-8 flex flex-col items-center pt-7">
                  <h2 className="text-[19px] font-normal tracking-[0.15em] text-brand-primary">
                    产品分类
                  </h2>
                  <div className="mt-2 w-[70px] border-b border-brand-primary" />
                </div>

                {/* Category List - 与 FAQ 问题列表一致 */}
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={showAllProducts}
                    className="px-3 py-4 text-left text-brand-primary"
                  >
                    全部产品
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        if (cat.productSlug) navigateToProduct(cat.productSlug);
                      }}
                      disabled={!cat.productSlug}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-4 text-left transition-colors duration-200",
                        cat.productSlug
                          ? "active:bg-brand-charcoal/[0.03]"
                          : "cursor-not-allowed opacity-40"
                      )}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                        {getCategoryIconPath(cat.name) ? (
                          <Image
                            src={getCategoryIconPath(cat.name)!}
                            alt={cat.name}
                            width={32}
                            height={32}
                            className="h-8 w-8"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-lg bg-brand-beige/30" />
                        )}
                      </div>
                      <span className="flex-1 truncate text-[14px] font-light leading-[1.6] tracking-[0.04em] text-brand-primary">
                        {cat.name}
                      </span>
                      {cat.productSlug ? (
                        <ChevronRight
                          size={16}
                          strokeWidth={1.5}
                          className="shrink-0 text-brand-primary/40"
                        />
                      ) : (
                        <span className="shrink-0 text-[12px] font-light tracking-[0.06em] text-brand-charcoal/40">
                          敬请期待
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Copyright */}
                <div className="mt-auto flex flex-col items-center justify-center pb-4 pt-10">
                  <p className="text-[12px] font-light tracking-[0.08em] text-brand-charcoal/[0.48]">
                    &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
                  </p>
                </div>
              </m.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* 移动端展示层 */}
      {renderMobileShowcase()}

      {/* 桌面端内容展示 */}
      <div className="mx-auto hidden h-full w-full max-w-[1920px] flex-col overflow-hidden lg:flex">
        <div className="flex-1 overflow-hidden px-16 pb-6 pt-4 xl:px-[12%]">
          <div className="flex h-full flex-col">
            <div className="flex flex-1 flex-col justify-center">
              <m.header
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] }}
                className="flex-shrink-0"
              >
                <h1 className="mb-6 text-2xl font-light tracking-[0.15em] text-brand-charcoal [@media(max-height:700px)]:mb-3">
                  {listTitle}
                </h1>
              </m.header>

              <section
                ref={desktopScrollRef}
                onScroll={handleDesktopScroll}
                className="grid min-h-0 grid-cols-3 gap-8 overflow-y-auto"
              >
                {visibleProducts.map((product, index) => (
                  <NextLink
                    key={product.id}
                    href={`/products/${product.slug}`}
                    onClick={(e) => handleProductLinkClick(e, product.slug)}
                    className={cn(
                      "group relative flex cursor-pointer flex-col",
                      index === 1 && "mt-12 [@media(max-height:700px)]:mt-6"
                    )}
                  >
                    <m.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.8,
                        ease: [0.19, 1, 0.22, 1],
                        delay: 0.1 + index * 0.1,
                      }}
                    >
                      <div
                        className={cn(
                          "relative w-full overflow-hidden bg-white transition-all duration-700 ease-[cubic-bezier(0.19,1,0.22,1)] group-hover:-translate-y-1 group-hover:shadow-[0_15px_30px_rgba(0,38,62,0.1)]",
                          index === 1
                            ? "aspect-[4/5.2] max-h-[50vh] [@media(max-height:700px)]:max-h-[36vh]"
                            : "aspect-[4/4.5] max-h-[42vh] [@media(max-height:700px)]:max-h-[32vh]"
                        )}
                      >
                        <div className="pointer-events-none absolute inset-3 z-10 border border-brand-charcoal/[0.08]" />
                        {product.images[0] && (
                          <Image
                            src={product.images[0].url}
                            alt={product.name}
                            fill
                            className="object-cover object-center transition-transform duration-[1.2s] ease-[cubic-bezier(0.19,1,0.22,1)] group-hover:scale-[1.05]"
                            sizes="33vw"
                            priority={index <= 1}
                          />
                        )}
                      </div>
                      <div className="mt-3">
                        <h2 className="text-sm font-light tracking-[0.12em] text-brand-charcoal">
                          {product.name}
                        </h2>
                        {product.capacity && (
                          <span className="mt-0.5 block text-[10px] text-brand-charcoal/60">
                            {product.capacity}
                          </span>
                        )}
                      </div>
                    </m.div>
                  </NextLink>
                ))}
              </section>
            </div>

            {/* Footer Info */}
            <div className="flex shrink-0 flex-col items-center justify-center gap-2 pt-4">
              <p className="text-center text-[11px] font-light tracking-[0.15em] text-brand-charcoal/[0.48]">
                &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
