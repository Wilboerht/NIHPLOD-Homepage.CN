/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Link } from "next-view-transitions";
import { m, AnimatePresence } from "framer-motion";
import { ChevronDown, Menu, X } from "lucide-react";
import { ProductDrawer } from "@/components/website";
import type { ProductData } from "@/components/website/ProductDrawer";
import { cn } from "@/lib/utils";
import { useLayout } from "@/contexts/LayoutContext";

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
  backgroundImage?: string;
}

/**
 * 产品列表内容组件
 * 基于 First Page.html 的三列错落网格布局设计，放在可展开/收起的抽屉中
 */
export function ProductsContent({ categories, products, backgroundImage }: ProductsContentProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { isDrawerOpen, setDrawerOpen } = useLayout();

  // 监听 LayoutContext 中的 isDrawerOpen 变化，同步本地 isExpanded 状态
  // 解决：点击底部导航栏时，setDrawerOpen(true) 不会触发本地状态更新的问题
  useEffect(() => {
    if (isDrawerOpen && !isExpanded) {
      setIsExpanded(true);
    } else if (!isDrawerOpen && isExpanded) {
      setIsExpanded(false);
    }
  }, [isDrawerOpen, isExpanded]);

  // 组件加载后自动展开，实现"抽屉下拉"动画
  useEffect(() => {
    // 稍微延迟以展示"下拉"动画
    const timer = setTimeout(() => {
      setIsExpanded(true);
      setDrawerOpen(true);
    }, 100);
    return () => clearTimeout(timer);
  }, [setDrawerOpen]);

  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [productDrawerOpen, setProductDrawerOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductData | null>(null);

  // 打开产品抽屉
  const handleProductClick = (product: Product) => {
    const productData: ProductData = {
      id: product.id,
      name: product.name,
      nameEn: product.nameEn,
      slug: product.slug,
      description: product.description,
      price: product.price,
      capacity: product.capacity || undefined,
      purchaseUrl: product.purchaseUrl || undefined,
      purchaseLinks: product.purchaseLinks,
      images: product.images.map((img) => ({
        url: img.url,
        alt: img.alt || undefined,
      })),
      category: { name: product.category.name },
      ingredients: product.ingredients || undefined,
      usage: product.usage || undefined,
      benefits: product.benefits,
    };
    setSelectedProduct(productData);
    setProductDrawerOpen(true);
  };

  // 关闭抽屉
  const handleCloseDrawer = () => {
    setProductDrawerOpen(false);
  };

  return (
    <>
      {/* 背景已移至 layout.tsx 实现无缝切换 */}

      {/* 内容区域容器 */}
      <m.div
        className="safe-area-content !top-0"
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* 主内容区域 + 展开按钮一体化 */}
        <m.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="h-full"
        >
          {/* 主内容区域 + 按钮一体化容器 */}
          <div className="flex h-full flex-col items-center">
            {/* 主内容区域 - 抽屉 */}
            <m.div
              className="relative w-full overflow-hidden rounded-b-2xl bg-[#F0EDE1] lg:rounded-b-3xl"
              style={{ willChange: "flex-grow, height" }}
              initial={{ height: 0, flexGrow: 0 }}
              animate={{
                flexGrow: isExpanded ? 1 : 0,
                height: !isExpanded ? 0 : "auto"
              }}
              transition={{
                duration: 1.2,
                ease: [0.22, 1, 0.36, 1],
                // 展开时延迟0.4s等待导航栏收起（大幅重叠以消除视觉间隔）；收起时不延迟
                delay: isExpanded ? 0.3 : 0
              }}
            >
              {/* 矿物纹理覆盖层 */}
              <div className="texture-overlay absolute inset-0" />

              {/* 装饰线条 */}
              <AnimatePresence>
                {isExpanded && (
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
              <div className={cn("relative z-10 flex h-full flex-col overflow-hidden", !isExpanded && "hidden")}>
                {/* 移动端专用 Header - Grid 布局保证完美对齐 */}
                <nav className="grid h-[80px] flex-shrink-0 grid-cols-[1fr_auto_1fr] items-center px-6 lg:hidden">
                  {/* 左侧：占位 */}
                  <div className="h-10 w-10 justify-self-start" />

                  {/* 中间：Logo */}
                  <Link href="/" className="justify-self-center">
                    <Image
                      src="/images/logo.png"
                      alt="Logo"
                      width={100}
                      height={28}
                      className="h-8 w-auto opacity-90 transition-opacity hover:opacity-70"
                    />
                  </Link>

                  {/* 右侧：菜单按钮 */}
                  <div className="flex items-center justify-self-end">
                    <button
                      type="button"
                      onClick={() => setIsCategoryMenuOpen(true)}
                      className="flex h-10 w-10 items-center justify-center text-[#00263E] opacity-80 transition-opacity hover:opacity-60"
                    >
                      <Menu className="h-6 w-6" strokeWidth={1.2} />
                    </button>
                  </div>
                </nav>

                {/* 桌面端专用 Header - Flex 布局 */}
                <nav className="relative hidden h-[100px] flex-shrink-0 items-center justify-between border-b border-[#00263E]/10 px-[8%] lg:flex">
                  {/* Logo */}
                  <Link href="/">
                    <Image
                      src="/images/logo.png"
                      alt="Logo"
                      width={120}
                      height={32}
                      className="h-9 w-auto opacity-90 transition-opacity hover:opacity-70"
                    />
                  </Link>

                  {/* 导航链接 */}
                  <div className="flex items-center gap-6">
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          const product = products.find(p => p.categoryId === cat.id);
                          if (product) handleProductClick(product);
                        }}
                        className="group relative py-1 text-[15px] font-medium text-[#1a1a1a] transition-all hover:opacity-80"
                      >
                        {cat.name}
                        <span className="absolute bottom-0 left-0 h-px w-0 bg-brand-gold transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:w-full" />
                      </button>
                    ))}
                  </div>

                  {/* 占位（用户和购物袋按钮暂时隐藏）*/}
                  <div className="w-6" />
                </nav>

                {/* 产品网格内容 - First Page.html 风格 - 一屏显示 */}
                <div className="flex flex-1 flex-col overflow-hidden px-[5%] pb-4 lg:px-[8%]">
                  {/* Section Header - 紧凑样式 */}
                  <m.header
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] }}
                    className="mb-6 flex-shrink-0 border-l border-[#00263E] pl-4 lg:mb-10 lg:pl-6"
                  >
                    <span className="mb-1 block text-[12px] tracking-[0.3em] text-[#00263E]/60 lg:text-xs">
                      COLLECTION 2026
                    </span>
                    <h1 className="text-[24px] font-light tracking-[0.2em] text-[#00263E] lg:text-3xl">
                      当季热卖
                    </h1>
                  </m.header>

                  {/* 产品网格/轮播 - 移动端轮播，桌面端网格 */}
                  <section className="
                    flex w-full snap-x snap-mandatory overflow-x-auto pb-6 scrollbar-hide px-[7.5vw]
                    lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-3 lg:gap-10 lg:overflow-visible lg:pb-0 lg:px-0
                  ">
                    {products.slice(0, 3).map((product, index) => (
                      <m.div
                        key={product.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1], delay: 0.1 + index * 0.1 }}
                        onClick={() => handleProductClick(product)}
                        className={cn(
                          "group relative flex shrink-0 cursor-pointer flex-col",
                          // 移动端：宽度占屏幕 75%，居中对齐，Snap对齐 (容器添加 px-[7.5vw] + 父级5% ≈ 12.5% 确保居中)
                          "w-[75vw] snap-center px-2 h-full justify-between",
                          // 桌面端：重置宽度和内边距，应用错落布局
                          "lg:w-auto lg:px-0",
                          // 第一列：正常高度
                          index === 0 && "lg:h-[78%]",
                          // 第二列：最高，延伸到底部
                          index === 1 && "lg:mt-[5%] lg:h-[95%]",
                          // 第三列：与第一列高度一致
                          index === 2 && "lg:h-[78%]"
                        )}
                      >
                        {/* 图片容器 - 桌面端使用 flex-1 填充可用空间 */}
                        <div className="relative h-[40vh] w-full overflow-hidden bg-white p-4 transition-all duration-700 ease-[cubic-bezier(0.19,1,0.22,1)] group-hover:-translate-y-1 group-hover:shadow-[0_20px_40px_rgba(0,38,62,0.1)] lg:flex-1 lg:h-auto lg:p-6">
                          {/* 内部装饰边框 */}
                          <div className="pointer-events-none absolute inset-3 border border-[#00263E]/[0.08]" />
                          {product.images[0] && (
                            <Image
                              src={product.images[0].url}
                              alt={product.images[0].alt || product.name}
                              fill
                              className="object-contain p-4 transition-transform duration-[1.2s] ease-[cubic-bezier(0.19,1,0.22,1)] group-hover:scale-[1.05] lg:p-6"
                              sizes="(max-width: 1024px) 85vw, 33vw"
                            />
                          )}
                        </div>
                        <div className="mt-3 flex-shrink-0 px-1 text-center lg:mt-4 lg:text-left lg:min-h-[70px]">
                          <h2 className="text-[18px] font-medium tracking-wide text-[#00263E] lg:text-base">
                            {product.name}
                          </h2>
                          {product.capacity && (
                            <span className="mt-1 block text-[12px] text-[#00263E]/60 lg:text-xs">
                              {product.capacity}
                            </span>
                          )}
                        </div>
                      </m.div>
                    ))}
                  </section>

                  {/* 查看全部产品按钮 - 仅移动端显示，点击效果同菜单按钮 */}
                  <m.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5, duration: 0.8 }}
                    className="flex justify-center px-[7.5vw] pb-8 lg:hidden"
                  >
                    <button
                      onClick={() => setIsCategoryMenuOpen(true)}
                      className="group flex w-full items-center justify-center gap-2 border border-[#00263E]/20 py-3 text-sm tracking-[0.2em] text-[#00263E] transition-all hover:border-[#00263E] hover:bg-[#00263E] hover:text-[#F0EDE1]"
                    >
                      查看全部产品
                      <span className="text-xs transition-transform group-hover:translate-x-1">→</span>
                    </button>
                  </m.div>
                </div>

              </div>

              {/* 全屏水印 - 最底层 */}
              <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden">
                <Image
                  src="/images/watermark.png"
                  alt=""
                  width={2000}
                  height={2000}
                  className="h-[120%] w-auto max-w-none opacity-[0.03]"
                />
              </div>
            </m.div>

            {/* 展开/收起按钮 - 放在 m.div 外部作为兄弟元素 */}
            <button
              onClick={() => {
                const newState = !isExpanded;
                setIsExpanded(newState);
                setDrawerOpen(newState);
              }}
              className="group -mt-[1px] relative z-10 flex items-center justify-center rounded-b-2xl bg-[#F0EDE1] px-10 py-3 shadow-sm transition-shadow hover:shadow-md lg:px-14 lg:py-3.5"
            >
              {/* 矿物纹理覆盖层 */}
              <div className="texture-overlay absolute inset-0 rounded-b-2xl" />
              <m.div
                className="relative z-10 flex flex-col items-center"
                animate={{ rotate: isExpanded ? 180 : 0, scale: 1 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              >
                <ChevronDown className="h-7 w-7 text-brand-gold lg:h-8 lg:w-8" />
                <ChevronDown className="-mt-5 h-7 w-7 text-brand-gold lg:h-8 lg:w-8" />
              </m.div>
            </button>
          </div>
        </m.div>
      </m.div>

      {/* 移动端产品分类菜单覆盖层 */}
      <AnimatePresence>
        {isCategoryMenuOpen && (
          <m.div
            initial={{ opacity: 0, y: "-100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "-100%" }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-50 flex flex-col bg-[#F0EDE1] lg:hidden"
          >
            {/* 菜单头部 */}
            <header className="grid h-[80px] w-full flex-shrink-0 grid-cols-[1fr_auto_1fr] items-center px-4">
              <div /> {/* 左侧占位 */}

              {/* 中间 Logo */}
              <div className="justify-self-center">
                <img
                  src="https://wp-cdn.4ce.cn/v2/SItKqUC.png"
                  alt="Logo"
                  className="h-8 w-auto opacity-90"
                />
              </div>

              {/* 右侧关闭按钮 */}
              <button
                type="button"
                onClick={() => setIsCategoryMenuOpen(false)}
                className="flex h-10 w-10 items-center justify-center justify-self-end text-[#00263E] opacity-80"
              >
                <X className="h-6 w-6" strokeWidth={1.2} />
              </button>
            </header>

            {/* 菜单内容 - 垂直居中列表 */}
            <div className="flex flex-1 flex-col items-center justify-center gap-8 pb-20">
              {categories.map((cat, index) => (
                <m.button
                  key={cat.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + index * 0.1, duration: 0.5 }}
                  onClick={() => {
                    const product = products.find(p => p.categoryId === cat.id);
                    if (product) {
                      handleProductClick(product);
                      setIsCategoryMenuOpen(false);
                    }
                  }}
                  className="group flex flex-col items-center gap-1"
                >
                  <span className="text-[14px] font-medium text-[#1a1a1a] transition-colors group-hover:text-brand-gold">
                    {cat.name}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-[#1a1a1a]/40 transition-colors group-hover:text-brand-gold/70">
                    {cat.nameEn}
                  </span>
                </m.button>
              ))}
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {/* 产品详情抽屉 */}
      <ProductDrawer
        isOpen={productDrawerOpen}
        onClose={handleCloseDrawer}
        product={selectedProduct}
      />

      {/* 动态背景图片 - 移至最底层，位于抽屉之外 */}
      {backgroundImage && (
        <div className="fixed inset-0 z-[-1]">
          <Image
            src={backgroundImage}
            alt="Background"
            fill
            className="object-cover"
            priority
          />
          {/* 叠加层，确保文字可读性 */}
          <div className="absolute inset-0 bg-black/10" />
        </div>
      )}
    </>
  );
}