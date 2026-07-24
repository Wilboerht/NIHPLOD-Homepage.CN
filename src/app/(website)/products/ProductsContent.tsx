/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import Image from "next/image";
import { Link } from "next-view-transitions";
import { useRouter } from "next/navigation";
import { m, AnimatePresence } from "framer-motion";
import { ChevronRight, ChevronLeft, ShoppingBag, LayoutGrid } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { useLayout } from "@/contexts/LayoutContext";
import { DrawerPageContainer } from "@/components/ui/DrawerPageContainer";
import { getCategoryIconPath } from "@/lib/product-icons";

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

  // 状态管理
  const [mobileView, setMobileView] = useState<"products" | "categories" | string>("products");
  const [activeTab, _setActiveTab] = useState<"featured" | "all">("featured");
  const router = useRouter();

  const _tabItems = [
    { id: "featured" as const, label: "当季热卖" },
    { id: "all" as const, label: "全部产品" },
  ];

  // 挑选主推的3个产品 (这里默认取前三个，实际可根据后台标记筛选)
  const featuredProducts = products.slice(0, 3);

  // 打开产品详情
  const handleProductClick = (product: Product) => {
    router.push(`/products/${product.slug}`);
  };

  /**
   * 移动端展示组件 - 抽屉内 drill-down 模式（与 FAQ 一致）
   */
  const MobileShowcase = () => (
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
            <Image src="/images/NIHPLOD-logo.svg" alt="NIHPLOD" fill className="object-contain" priority />
          </div>
        </Link>
        <div className="texture-overlay absolute inset-0 z-[-1]" />
      </div>

      {/* Scroll Area Wrapper - 渐隐遮罩 + drill-down */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* Top Fade Mask */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-30 h-6"
          style={{ background: "linear-gradient(to bottom, #FBF8F0, transparent)" }}
        />

        <div className="relative z-20 flex h-full flex-col overflow-y-auto px-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <AnimatePresence mode="wait">
            {mobileView === "products" ? (
              /* --- 产品列表视图 --- */
              <m.div
                key="product-list"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="flex min-h-full flex-col"
              >
                {/* Title */}
                <div className="mb-7 flex flex-col items-center pt-4">
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
                      className="flex flex-col"
                    >
                      <Link
                        href={`/products/${product.slug}`}
                        onClick={(e) => { e.preventDefault(); handleProductClick(product); }}
                        className="group relative flex w-full flex-col bg-white/60 backdrop-blur-md transition-all active:scale-[0.98]"
                      >
                        <div className="texture-overlay pointer-events-none absolute inset-0 opacity-[0.03]" />
                        <div className="relative z-10 aspect-square w-full overflow-hidden bg-[#FBF8F0]">
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
                        className="flex w-full items-center justify-between pb-1 pt-3 text-left"
                      >
                        <div className="flex max-w-fit flex-col items-start gap-1">
                          <p className="line-clamp-1 text-left text-[15px] font-normal tracking-[0.08em] leading-[24px] text-brand-primary" title={product.name}>
                            {product.name}
                          </p>
                          <p className="text-left text-[14px] font-light tracking-[0.08em] text-brand-primary/60">
                            {formatPrice(product.price)}
                          </p>
                        </div>
                        <ChevronRight size={20} strokeWidth={1.5} className="shrink-0 text-brand-primary opacity-40" />
                      </button>
                    </m.div>
                  ))}
                </div>

                {/* Copyright */}
                <div className="mt-auto flex flex-col items-center justify-center pt-10">
                  <p className="text-[12px] font-light tracking-[0.08em] text-brand-charcoal/[0.48]">
                    &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
                  </p>
                </div>
              </m.div>

            ) : mobileView === "categories" ? (
              /* --- 分类列表视图 --- */
              <m.div
                key="category-list"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="flex min-h-full flex-col"
              >
                {/* Title */}
                <div className="mb-7 flex flex-col items-center pt-4">
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
                        onClick={() => { if (categoryProduct) setMobileView(cat.id); }}
                        disabled={!categoryProduct}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-4 text-left transition-colors duration-200",
                          categoryProduct ? "active:bg-brand-charcoal/[0.03]" : "cursor-not-allowed opacity-40"
                        )}
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                          {getCategoryIconPath(cat.name) ? (
                            <Image src={getCategoryIconPath(cat.name)!} alt={cat.name} width={32} height={32} className="h-8 w-8" />
                          ) : (
                            <div className="h-8 w-8 rounded-lg bg-brand-beige/30" />
                          )}
                        </div>
                        <span className="flex-1 truncate text-[14px] font-light leading-[1.6] tracking-[0.04em] text-brand-primary">
                          {cat.name}
                        </span>
                        {categoryProduct ? (
                          <ChevronRight size={16} strokeWidth={1.5} className="shrink-0 text-brand-primary/40" />
                        ) : (
                          <span className="shrink-0 text-[12px] font-light tracking-[0.06em] text-brand-charcoal/40">敬请期待</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Copyright */}
                <div className="mt-auto flex flex-col items-center justify-center pt-10">
                  <p className="text-[12px] font-light tracking-[0.08em] text-brand-charcoal/[0.48]">
                    &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
                  </p>
                </div>
              </m.div>

            ) : (
              /* --- 分类详情视图（产品展示） --- */
              <m.div
                key={`cat-detail-${mobileView}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="flex min-h-full flex-col"
              >
                {(() => {
                  const cat = categories.find((c) => c.id === mobileView);
                  const product = products.find((p) => p.categoryId === mobileView);
                  if (!cat || !product) return null;
                  return (
                    <>
                      {/* Category + Product Title */}
                      <div className="pt-6">
                        <h2 className="text-[17px] font-normal leading-[1.6] tracking-[0.06em] text-brand-primary">
                          {cat.name}
                        </h2>
                      </div>

                      {/* Decorative Divider */}
                      <div className="mx-auto mt-6 w-[40px] border-b border-brand-charcoal/[0.12]" />

                      {/* Product Image */}
                      <div className="mt-6 relative aspect-square w-full overflow-hidden bg-[#FBF8F0]">
                        {product.images[0] && (
                          <Image src={product.images[0].url} alt={product.name} fill className="object-cover" />
                        )}
                      </div>

                      {/* Product Info */}
                      <div className="mt-5 flex flex-col items-center text-center">
                        <h3 className="text-[15px] font-normal tracking-[0.08em] text-brand-primary">
                          {product.name}
                        </h3>
                        <p className="mt-1 text-[14px] font-light tracking-[0.08em] text-brand-primary/60">
                          {formatPrice(product.price)}
                        </p>
                        {product.description && (
                          <p className="mt-4 text-[14px] font-light leading-[1.8] tracking-[0.06em] text-brand-charcoal/90">
                            {product.description}
                          </p>
                        )}
                      </div>

                      {/* CTA */}
                      <div className="mt-8 flex justify-center">
                        <button
                          type="button"
                          onClick={() => { handleProductClick(product); setMobileView("products"); }}
                          className="rounded-full border border-brand-charcoal/20 px-6 py-3.5 text-[14px] font-light tracking-[0.08em] text-brand-charcoal/70 transition-all duration-300 active:scale-[0.97]"
                        >
                          查看完整详情
                        </button>
                      </div>

                      {/* Copyright */}
                      <div className="mt-auto flex flex-col items-center justify-center pb-6 pt-10">
                        <p className="text-[12px] font-light tracking-[0.08em] text-brand-charcoal/[0.48]">
                          &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
                        </p>
                      </div>
                    </>
                  );
                })()}
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 底部 Tab 栏 - 仅在产品列表/分类列表时显示，详情态隐藏 */}
      {mobileView !== "products" && mobileView !== "categories" ? null : (
        <div className="flex shrink-0 items-center justify-center gap-8 border-t border-brand-charcoal/[0.06] bg-brand-cream/95 px-6 py-4 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setMobileView("products")}
            className={cn(
              "flex flex-col items-center gap-1 transition-colors",
              mobileView === "products" ? "text-brand-primary" : "text-brand-charcoal/40"
            )}
          >
            <ShoppingBag size={20} strokeWidth={1.5} />
            <span className="text-[11px] font-light tracking-[0.06em]">推荐</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileView("categories")}
            className={cn(
              "flex flex-col items-center gap-1 transition-colors",
              mobileView === "categories" ? "text-brand-primary" : "text-brand-charcoal/40"
            )}
          >
            <LayoutGrid size={20} strokeWidth={1.5} />
            <span className="text-[11px] font-light tracking-[0.06em]">全部</span>
          </button>
        </div>
      )}
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
            <MobileShowcase />
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
                    alt="Logo"
                    fill
                    className="object-contain"
                    priority
                  />
                </div>
              </Link>

              {/* 导航链接 */}
              <div className="flex items-center justify-center gap-6">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      const product = products.find((p) => p.categoryId === cat.id);
                      if (product) handleProductClick(product);
                    }}
                    className="group relative py-1 text-[15px] font-light tracking-[0.15em] text-[#00263E] transition-all hover:opacity-80"
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
            <div className="flex-1 overflow-hidden px-16 pt-4 pb-6 xl:px-[12%]">
              <div className="flex h-full flex-col">
                <div className="flex flex-1 flex-col justify-center">
                  <m.header
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] }}
                    className="flex-shrink-0"
                  >
                    <h1 className="mb-6 text-2xl font-light tracking-[0.15em] text-[#00263E]">
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
                          index === 1 && "mt-12" // 中间卡片微调，不宜过大以防超出
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
                                ? "aspect-[4/5.2] max-h-[50vh]"
                                : "aspect-[4/4.5] max-h-[42vh]"
                            )}
                          >
                            <div className="pointer-events-none absolute inset-3 z-10 border border-[#00263E]/[0.08]" />
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
                            <h2 className="text-sm font-light tracking-[0.12em] text-[#00263E]">
                              {product.name}
                            </h2>
                            {product.capacity && (
                              <span className="mt-0.5 block text-[10px] text-[#00263E]/60">
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
