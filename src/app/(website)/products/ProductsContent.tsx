/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import Image from "next/image";
import { Link } from "next-view-transitions";
import { useRouter } from "next/navigation";
import { m, AnimatePresence } from "framer-motion";
import { ChevronRight, ChevronLeft } from "lucide-react";
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
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [activeTab, _setActiveTab] = useState<'featured' | 'all'>('featured');
  const router = useRouter();

  const _tabItems = [
    { id: 'featured' as const, label: '当季热卖' },
    { id: 'all' as const, label: '全部产品' },
  ];

  // 挑选主推的3个产品 (这里默认取前三个，实际可根据后台标记筛选)
  const featuredProducts = products.slice(0, 3);

  // 打开产品详情
  const handleProductClick = (product: Product) => {
    router.push(`/products/${product.slug}`);
  };

  /**
   * 移动端展示组件 - 三行错落橱窗
   */
  const MobileShowcase = () => (
    <div className="flex h-full flex-col overflow-hidden bg-[#FBF8F0]">
      {/* Header - Mobile */}
      <div className="flex h-[88px] shrink-0 items-center justify-center relative z-50">
        <Link href="/" className="flex items-center justify-center mt-1">
          <div className="relative h-[28px] w-[100px]">
            <Image
              src="/images/NIHPLOD-logo.svg"
              alt="NIHPLOD Logo"
              fill
              className="object-contain"
              priority
            />
          </div>
        </Link>
      </div>

      {/* 移动端标题 */}
      <div className="flex items-center justify-between px-5 pt-2 pb-6 shrink-0">
        <div className="flex flex-col items-start">
          <h2
            className="text-[24px] font-medium tracking-[0.2em] text-[#00263E]"
            style={{ fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif" }}
          >
            {activeTab === 'featured' ? '当季热卖' : '全部产品'}
          </h2>
          <div className="mt-2 w-[70px] border-b-[1.5px] border-[#00263E]" />
        </div>
        <button
          type="button"
          onClick={() => setIsCategoryMenuOpen(true)}
          className="flex items-center gap-0.5 text-[13px] font-normal tracking-wide text-[#4A6272] transition-all active:scale-95"
          style={{ fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif" }}
        >
          全部产品
          <ChevronRight size={14} strokeWidth={1.5} />
        </button>
      </div>

      {/* 产品区域 - 手机端卡片布局 */}
      <div className="flex flex-1 flex-col gap-5 px-5 py-4 overflow-y-auto scrollbar-hide">
        {(activeTab === 'featured' ? featuredProducts : products).map((product, idx) => (
          <m.div
            key={product.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + idx * 0.1, duration: 0.6, ease: "easeOut" }}
            className="flex flex-col"
          >
            {/* 卡片 - 只包含产品图片 */}
            <Link
              href={`/products/${product.slug}`}
              onClick={(e) => { e.preventDefault(); handleProductClick(product); }}
              className="group relative flex w-full flex-col bg-white/60 backdrop-blur-md border-[1.5px] border-[#FFFFFF] transition-all active:scale-[0.98]"
            >
              {/* 矿物纹理 - 极淡 */}
              <div className="texture-overlay absolute inset-0 opacity-[0.03] pointer-events-none" />

              {/* 产品图片区域 —— 正方形容器，图片填满 */}
              <div className="relative z-10 w-full aspect-square overflow-hidden bg-[#FBF8F0]">
                {/* 容量标签 */}
                {product.capacity && (
                  <div className="absolute top-3 right-3 z-20 rounded-full bg-white/90 px-3 py-1 text-[12px] font-medium text-[#00263E] shadow-sm">
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

            {/* 产品信息 - 放在卡片下方 */}
            <button
              type="button"
              onClick={() => handleProductClick(product)}
              className="flex w-full items-center justify-between pt-3 pb-1 text-left"
            >
              <div className="flex flex-col items-start gap-1 max-w-fit">
                <p
                  className="text-[16px] font-normal text-[#00263e] leading-[24px] line-clamp-1 text-left"
                  style={{ fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif" }}
                  title={product.name}
                >
                  {product.name}
                </p>
                <p className="text-[14px] font-light text-[#00263e]/90 text-left" style={{ fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif" }}>
                  {formatPrice(product.price)}
                </p>
              </div>
              <ChevronRight
                size={20}
                strokeWidth={1.5}
                className="shrink-0 opacity-60 text-[#00263e]"
              />
            </button>
          </m.div>
        ))}
      </div>
      {/* 移动端版权信息 - 与指南页保持一致 */}
      <footer className="shrink-0 pt-3 pb-1 relative z-20 flex flex-col items-center">
        <p className="text-[10px] font-medium tracking-[0.12em] text-[rgba(0,38,62,0.3)]" style={{ fontFamily: "'Futura', sans-serif" }}>
          &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
        </p>
      </footer>
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
                      className="pointer-events-none absolute left-[5%] top-0 bottom-0 hidden w-px origin-center lg:block"
                      style={{ background: "linear-gradient(to bottom, transparent 0%, rgba(0,38,62,0.08) 30%, rgba(0,38,62,0.08) 70%, transparent 100%)" }}
                    />
                    <m.div
                      initial={{ scaleY: 0, opacity: 0 }}
                      animate={{ scaleY: 1, opacity: 1 }}
                      exit={{ scaleY: 0, opacity: 0 }}
                      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
                      className="pointer-events-none absolute right-[5%] top-0 bottom-0 hidden w-px origin-center lg:block"
                      style={{ background: "linear-gradient(to bottom, transparent 0%, rgba(0,38,62,0.08) 30%, rgba(0,38,62,0.08) 70%, transparent 100%)" }}
                    />
                  </>
                )}
              </AnimatePresence>

                {/* 内容区域 */}
                <div className={cn("relative z-10 flex h-full flex-col overflow-hidden pb-3 transition-opacity duration-300", isDrawerOpen ? "opacity-100 delay-300" : "opacity-0 pointer-events-none")}>
                {/* 移动端展示层 - 仅在移动端显示，一屏式布局 */}
                <div className="relative flex h-full flex-col lg:hidden overflow-hidden">
                  <MobileShowcase />
                </div>

                {/* 桌面端内容展示 - 保持原有响应式逻辑但对移动端隐藏 */}
                <div className="hidden h-full flex-col overflow-hidden lg:flex w-full max-w-[1920px] mx-auto">
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
                            const product = products.find(p => p.categoryId === cat.id);
                            if (product) handleProductClick(product);
                          }}
                          className="group relative py-1 text-[15px] font-medium tracking-[0.1em] text-[#00263E] transition-all hover:opacity-80"
                        >
                          {cat.name}
                          <span className="absolute bottom-0 left-0 h-px w-0 bg-brand-gold transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:w-full" />
                        </button>
                      ))}
                    </div>

                    <div />
                  </nav>

                  {/* 桌面端主内容区：增加滚动支持并移除可能导致重叠的弹性冲突 */}
                  {/* 桌面端主内容区：通过限制高度和压缩间距实现单屏显示 */}
                  <div className="flex-1 overflow-hidden px-[12%] py-4">
                    <div className="flex h-full flex-col">
                      <div className="flex flex-1 flex-col justify-center">
                        <m.header
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] }}
                          className="mb-8 flex-shrink-0"
                        >
                          <h1 className="text-2xl font-light tracking-[0.2em] text-[#00263E]">
                            当季热卖
                          </h1>
                        </m.header>

                        <section className="grid grid-cols-3 gap-8 min-h-0">
                          {products.slice(0, 3).map((product, index) => (
                            <Link
                              key={product.id}
                              href={`/products/${product.slug}`}
                              onClick={(e) => { e.preventDefault(); handleProductClick(product); }}
                              className={cn(
                                "group relative flex cursor-pointer flex-col",
                                index === 1 && "mt-12" // 中间卡片微调，不宜过大以防超出
                              )}
                            >
                              <m.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1], delay: 0.1 + index * 0.1 }}
                              >
                                <div className={cn(
                                  "relative w-full overflow-hidden bg-white transition-all duration-700 ease-[cubic-bezier(0.19,1,0.22,1)] group-hover:-translate-y-1 group-hover:shadow-[0_15px_30px_rgba(0,38,62,0.1)]",
                                  index === 1 ? "aspect-[4/5.2] max-h-[50vh]" : "aspect-[4/4.5] max-h-[42vh]"
                                )}>
                                  <div className="pointer-events-none absolute inset-3 border border-[#00263E]/[0.08] z-10" />
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
                                  <h2 className="text-sm font-medium tracking-wide text-[#00263E]">
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

                      {/* 桌面端页脚 - 紧凑排版 */}
                      <footer className="pt-10 pb-4 flex flex-col items-center opacity-30 shrink-0">
                        <p className="text-[10px] font-light tracking-widest text-[#00263E] uppercase">
                          &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
                        </p>
                      </footer>
                    </div>
                  </div>
                </div>

                </div>

                {/* PC 端水印 */}
                <div className="pointer-events-none absolute inset-0 z-0 hidden md:flex items-center justify-center overflow-hidden">
                  <Image
                    src="/images/watermark.webp"
                    alt=""
                    width={2000}
                    height={800}
                    className="h-[120%] w-auto max-w-none opacity-[0.03]"
                  />
                </div>
      </DrawerPageContainer>

      {/* 移动端“产品导航”全屏覆盖层 */}
      <AnimatePresence>
        {isCategoryMenuOpen && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="fixed inset-0 z-[100] flex flex-col bg-[#FFFFFF]/95 backdrop-blur-xl lg:hidden"
          >
            {/* 手机端背景水印 - 同联系我们 */}
            <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
              <Image
                src="/images/watermark-mobile.png"
                alt=""
                fill
                className="object-cover"
                priority
              />
            </div>

            <div className="flex-1 flex flex-col px-4 pt-4 pb-4 relative z-10 overflow-hidden">
              {/* 手机端顶部栏 */}
              <div className="relative flex-shrink-0 h-[88px] w-full flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => setIsCategoryMenuOpen(false)}
                  className="absolute left-0 top-0 bottom-0 flex items-center justify-center px-4 py-[10px]"
                >
                  <ChevronLeft className="h-6 w-6 text-[#00263E]" />
                </button>
                <Link href="/" className="flex items-center justify-center py-[30px]">
          <div className="relative h-[42px] w-[150px]">
                    <Image
                      src="/images/NIHPLOD-logo.svg"
                      alt="NIHPLOD Logo"
                      fill
                      className="object-contain"
                      priority
                    />
                  </div>
                </Link>
              </div>

              {/* 标题区域 */}
              <div className="text-center pt-[6px] pb-9">
                <h2
                  className="text-[24px] font-medium tracking-[0.2em] text-[#00263E]"
                  style={{ fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif" }}
                >
                  全部产品
                </h2>
                <div className="mx-auto mt-2 w-[70px] border-b-[1.5px] border-[#00263E]" />
              </div>

              {/* 分类列表容器 */}
              <div className="flex-1 overflow-y-auto px-0 scrollbar-hide">
                <m.div
                  className="grid w-full grid-cols-2 gap-5 my-auto"
                  initial="hidden"
                  animate="visible"
                  variants={{
                    visible: { transition: { staggerChildren: 0.05 } }
                  }}
                >
                  {categories.map((cat) => {
                    const categoryProduct = products.find(p => p.categoryId === cat.id);
                    return (
                      <m.div
                        key={cat.id}
                        variants={{
                          hidden: { opacity: 0, scale: 0.95 },
                          visible: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } }
                        }}
                        className="w-full"
                      >
                        <Link
                          href={categoryProduct ? `/products/${categoryProduct.slug}` : '/products'}
                          onClick={(e) => {
                            e.preventDefault();
                            if (categoryProduct) {
                              handleProductClick(categoryProduct);
                              setIsCategoryMenuOpen(false);
                            }
                          }}
                          className={cn(
                            "group grid w-full grid-cols-[48px_1fr] items-center gap-4 rounded-2xl py-6 px-6 transition-all",
                            categoryProduct
                              ? "bg-[#FBF8F0]/60 active:scale-95 active:bg-[#FBF8F0]"
                              : "bg-[#FBF8F0]/30 cursor-not-allowed opacity-60"
                          )}
                        >
                          <div className={cn(
                            "flex h-12 w-12 items-center justify-center transition-transform",
                            categoryProduct && "group-active:scale-110"
                          )}>
                            {getCategoryIconPath(cat.name) ? (
                              <Image
                                src={getCategoryIconPath(cat.name)!}
                                alt={cat.name}
                                width={48}
                                height={48}
                                className="h-12 w-12"
                              />
                            ) : (
                              <div className="h-12 w-12 rounded-lg bg-brand-beige/30" />
                            )}
                          </div>
                          <div className="flex flex-col items-start">
                            <span
                              className="text-[15px] font-medium tracking-[0.1em] text-[#00263E]/90 whitespace-nowrap text-center"
                              style={{ fontFamily: "'Source Han Sans SC', 'PingFang SC', sans-serif" }}
                            >
                              {cat.name}
                            </span>
                            {!categoryProduct && (
                              <span className="text-[10px] text-[#00263E]/40 tracking-wider mt-0.5">敬请期待</span>
                            )}
                          </div>
                        </Link>
                      </m.div>
                    );
                  })}
                </m.div>
              </div>

              {/* Footer */}
              <div className="mt-auto pt-4 pb-4 text-center px-4">
                <p
                  className="text-[10px] font-medium tracking-[0.12em] text-[rgba(0,38,62,0.3)] uppercase"
                  style={{ fontFamily: "'Futura', sans-serif" }}
                >
                  &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
                </p>
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}
