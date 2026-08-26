"use client";

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import Image from "next/image";
import { Link } from "next-view-transitions";
import { useRouter } from "next/navigation";
import { m, AnimatePresence } from "framer-motion";
import { ChevronRight, ChevronLeft, ShoppingBag, LayoutGrid } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { useLayout } from "@/contexts/LayoutContext";
import { DrawerPageContainer } from "@/components/ui/DrawerPageContainer";
import { getCategoryIconPath } from "@/lib/product-icons";
import { trackEvent } from "@/lib/analytics";

interface Category {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
  icon?: string | null;
}

interface PurchaseLink {
  id: string;
  platform: string;
  url: string;
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
  purchaseLinks: PurchaseLink[];
  categoryId: string;
  category: Category;
  images: { url: string; alt: string | null }[];
  ingredients: string | null;
  usage: string | null;
  benefits: string[];
  allowDirectBuy: boolean;
  stock: number;
}

interface ProductsContentProps {
  categories: Category[];
  products: Product[];
}

/**
 * 产品列表内容组件
 * 基于 First Page.html 的三列错落网格布局设计，放在可展开/收起的抽屉中
 */
export function ProductsContent({ categories, products }: ProductsContentProps) {
  const { isDrawerOpen } = useLayout();

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
  const [mobileView, setMobileView] = useState<"products" | "categories" | string>("products");
  const [activeTab] = useState<"featured" | "all">("featured");
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const fadeMaskRef = useRef<HTMLDivElement>(null);
  const bottomFadeMaskRef = useRef<HTMLDivElement>(null);
  const tabButtonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const router = useRouter();

  // 挑选主推的3个产品 (这里默认取前三个，实际可根据后台标记筛选)
  const featuredProducts = products.slice(0, 3);

  // 打开产品详情
  const handleProductClick = (product: Product) => {
    router.push(`/products/${product.slug}`);
  };

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
  }, [mobileView, products.length, categories.length]);

  // 切换移动端 Tab：同步复位滚动位置，避免新列表从半屏中间开始展示
  const switchMobileView = (view: "products" | "categories") => {
    if (view === mobileView) return;
    setMobileView(view);
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
    switchMobileView(next);
    tabButtonsRef.current[next === "products" ? 0 : 1]?.focus();
  };

  /**
   * 移动端展示层 - 抽屉内 drill-down 模式（与 FAQ 一致）
   * 以渲染函数方式调用，避免渲染期创建组件导致状态重置
   */
  const renderMobileShowcase = () => (
    <div className="flex h-full flex-col overflow-hidden bg-[#FBF8F0]">
      {/* Header - 与 FAQ 返回按钮模式一致 */}
      <div className="sticky top-0 z-50 flex h-[88px] shrink-0 items-center justify-center border-b border-transparent bg-brand-cream/95 px-6 backdrop-blur-sm transition-all">
        <AnimatePresence>
          {mobileView !== "products" && mobileView !== "categories" && (
            <m.button
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              onClick={() => setMobileView("categories")}
              className="absolute left-4 flex items-center gap-0.5 text-[13px] font-light tracking-[0.04em] text-brand-charcoal/50 transition-colors active:text-brand-charcoal/70"
            >
              <ChevronLeft size={16} strokeWidth={1.5} />
              返回
            </m.button>
          )}
        </AnimatePresence>
        <Link href="/" className="mt-1 flex items-center justify-center">
          <div className="relative h-[28px] w-[100px]">
            <Image
              src="/images/NIHPLOD-logo.svg"
              alt="NIHPLOD"
              fill
              className="object-contain"
              priority
            />
          </div>
        </Link>
        <div className="texture-overlay absolute inset-0 z-[-1]" />
      </div>

      {/* 顶部 Tab 栏 - 紧贴 Header 下方吸顶，仅在产品列表/分类列表时显示，详情态隐藏 */}
      {mobileView !== "products" && mobileView !== "categories" ? null : (
        <div className="sticky top-[88px] z-40 shrink-0 bg-brand-cream/95 backdrop-blur-sm">
          {/* Texture Overlay for Tab bar to match drawer body */}
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
              onClick={() => switchMobileView("products")}
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
              <span className="relative text-[12px] tracking-[0.06em]">当季热卖</span>
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
              onClick={() => switchMobileView("categories")}
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
              <span className="relative text-[12px] tracking-[0.06em]">全部产品</span>
            </button>
          </div>
        </div>
      )}

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
          onScroll={updateFadeMasks}
          className="relative z-20 flex h-full flex-col overflow-y-auto px-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <AnimatePresence mode="wait">
            {mobileView === "products" ? (
              /* --- 产品列表视图 --- */
              <m.div
                key="product-list"
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
                    {activeTab === "featured" ? "当季热卖" : "全部产品"}
                  </h2>
                  <div className="mt-2 w-[70px] border-b border-brand-primary" />
                </div>

                {/* Product Cards */}
                <div className="flex flex-col gap-5">
                  {(activeTab === "featured" ? featuredProducts : products).map((product, idx) => (
                    <m.div
                      key={product.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + idx * 0.1, duration: 0.6, ease: "easeOut" }}
                      className="flex flex-col border border-brand-charcoal/[0.06] bg-[#FFFDF9]"
                    >
                      <Link
                        href={`/products/${product.slug}`}
                        onClick={(e) => {
                          e.preventDefault();
                          handleProductClick(product);
                        }}
                        className="group relative flex w-full flex-col transition-all active:scale-[0.98]"
                      >
                        <div className="texture-overlay pointer-events-none absolute inset-0 opacity-[0.03]" />
                        <div className="relative z-10 aspect-[4/5] w-full overflow-hidden bg-[#FBF8F0]">
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
                            priority={idx <= 1}
                          />
                        </div>
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleProductClick(product)}
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
                  {categories.map((cat) => {
                    const categoryProduct = products.find((p) => p.categoryId === cat.id);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          if (categoryProduct) handleProductClick(categoryProduct);
                        }}
                        disabled={!categoryProduct}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-4 text-left transition-colors duration-200",
                          categoryProduct
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
                        {categoryProduct ? (
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
                    );
                  })}
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

  // 关闭抽屉
  return (
    <>
      {/* 背景已移至 layout.tsx 实现无缝切换 */}

      <DrawerPageContainer>
        {/* 矿物纹理覆盖层 */}
        <div className="texture-overlay absolute inset-0" />

        {/* 装饰线条 */}
        <AnimatePresence>
          {isDrawerOpen && (
            <>
              <m.div
                initial={{ scaleY: 0, opacity: 0 }}
                animate={{ scaleY: 1, opacity: 1 }}
                exit={{ scaleY: 0, opacity: 0 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                className="pointer-events-none absolute bottom-0 left-[5%] top-0 hidden w-px origin-center lg:block"
                style={{
                  background:
                    "linear-gradient(to bottom, transparent 0%, rgba(0,38,62,0.08) 30%, rgba(0,38,62,0.08) 70%, transparent 100%)",
                }}
              />
              <m.div
                initial={{ scaleY: 0, opacity: 0 }}
                animate={{ scaleY: 1, opacity: 1 }}
                exit={{ scaleY: 0, opacity: 0 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
                className="pointer-events-none absolute bottom-0 right-[5%] top-0 hidden w-px origin-center lg:block"
                style={{
                  background:
                    "linear-gradient(to bottom, transparent 0%, rgba(0,38,62,0.08) 30%, rgba(0,38,62,0.08) 70%, transparent 100%)",
                }}
              />
            </>
          )}
        </AnimatePresence>

        {/* 内容区域 */}
        <div
          className={cn(
            "relative z-10 flex h-full flex-col overflow-hidden transition-opacity duration-300",
            isDrawerOpen ? "opacity-100 delay-300" : "pointer-events-none opacity-0"
          )}
        >
          {/* 移动端展示层 - 仅在移动端显示，一屏式布局 */}
          <div className="relative flex h-full flex-col overflow-hidden lg:hidden">
            {renderMobileShowcase()}
          </div>

          {/* 桌面端内容展示 - 保持原有响应式逻辑但对移动端隐藏 */}
          <div className="mx-auto hidden h-full w-full max-w-[1920px] flex-col overflow-hidden lg:flex">
            {/* 桌面端内容已有的逻辑... */}
            <nav className="relative grid h-[88px] flex-shrink-0 grid-cols-[150px_1fr_150px] items-center border-b border-brand-charcoal/[0.05] px-10 xl:px-[8%]">
              {/* Logo */}
              <Link href="/">
                <div className="relative h-9 w-[150px] opacity-90 transition-opacity hover:opacity-70">
                  <Image
                    src="/images/NIHPLOD-logo.svg"
                    alt="NIHPLOD"
                    fill
                    className="object-contain"
                    priority
                  />
                </div>
              </Link>

              {/* 导航链接 */}
              <div className="flex items-center justify-center gap-3 whitespace-nowrap xl:gap-6">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      const product = products.find((p) => p.categoryId === cat.id);
                      if (product) handleProductClick(product);
                    }}
                    className="group relative py-1 text-[13px] font-light tracking-[0.08em] text-brand-charcoal transition-all hover:opacity-80 xl:text-[15px] xl:tracking-[0.15em]"
                  >
                    {cat.name}
                    <span className="absolute bottom-0 left-0 h-px w-0 bg-brand-primary transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:w-full" />
                  </button>
                ))}
              </div>

              <div />
            </nav>

            {/* 桌面端主内容区：增加滚动支持并移除可能导致重叠的弹性冲突 */}
            {/* 桌面端主内容区：通过限制高度和压缩间距实现单屏显示 */}
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
                      当季热卖
                    </h1>
                  </m.header>

                  <section className="grid min-h-0 grid-cols-3 gap-8">
                    {products.slice(0, 3).map((product, index) => (
                      <Link
                        key={product.id}
                        href={`/products/${product.slug}`}
                        onClick={(e) => {
                          e.preventDefault();
                          handleProductClick(product);
                        }}
                        className={cn(
                          "group relative flex cursor-pointer flex-col",
                          index === 1 && "mt-12 [@media(max-height:700px)]:mt-6" // 中间卡片微调，不宜过大以防超出
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
                      </Link>
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
        </div>

        {/* PC 端水印 */}
        <div className="pointer-events-none absolute inset-0 z-0 hidden items-center justify-center overflow-hidden md:flex">
          <Image
            src="/images/watermark.webp"
            alt=""
            width={2000}
            height={800}
            className="h-[120%] w-auto max-w-none opacity-[0.03]"
          />
        </div>
      </DrawerPageContainer>
    </>
  );
}
