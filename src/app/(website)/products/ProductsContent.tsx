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

}


const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  "洁面": (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="17.9922" y="5" width="11.9999" height="37.9997" rx="1.99992" fill="url(#paint0_linear_2088_4549)" />
      <path d="M18.7941 5.99999C18.7941 5.99999 18.9941 5 23.9941 5C28.9941 5 29.1941 5.99999 29.1941 5.99999L29.4941 16.9999C29.994 16.9999 29.994 17.6666 29.994 17.9999V20.9999C30.494 21.0202 30.494 21.6665 30.494 21.9999V40.9997C30.494 42.1043 29.6006 42.9997 28.496 42.9997H23.9941H19.4922C18.3876 42.9997 17.4941 42.1051 17.4941 41.0005V21.9999C17.4941 21.1999 17.6608 20.9999 17.9941 20.9999V17.9999C17.9941 17.1999 18.1608 16.9999 18.4941 16.9999L18.7941 5.99999Z" stroke="#B795A7" strokeWidth="1.59993" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20.4062 16.9989C20.4062 16.9989 21.303 16.7988 23.9932 16.7988C26.6833 16.7988 27.5801 16.9989 27.5801 16.9989" stroke="#B795A7" strokeWidth="1.19995" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19.7441 21.099C19.7441 21.099 20.806 20.999 23.9916 20.999C27.1772 20.999 28.239 21.099 28.239 21.099" stroke="#B795A7" strokeWidth="1.19995" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21.7218 38.0581L21.0954 37.2988H20.9922V38.2793H21.1151V37.52L21.7407 38.2793H21.8446V37.2988H21.7218V38.0581Z" fill="#00263E" />
      <path d="M22.1953 37.2988H22.0723V38.2808H22.1953V37.2988Z" fill="#00263E" />
      <path d="M23.285 38.2793V37.2988H23.1622V37.727H22.5604V37.2988H22.4375V38.2793H22.5604V37.8511H23.1622V38.2793H23.285Z" fill="#00263E" />
      <path d="M23.9095 37.2988H23.4785V38.2796H23.6012V37.9535H23.9095C23.9522 37.9537 23.9945 37.9454 24.034 37.929C24.0735 37.9126 24.1094 37.8886 24.1397 37.8582C24.1699 37.8277 24.1939 37.7916 24.2103 37.7518C24.2267 37.712 24.2351 37.6693 24.2351 37.6262C24.2351 37.583 24.2267 37.5404 24.2103 37.5005C24.1939 37.4607 24.1699 37.4246 24.1397 37.3942C24.1094 37.3638 24.0735 37.3397 24.034 37.3233C23.9945 37.307 23.9522 37.2986 23.9095 37.2988ZM23.9095 37.8296H23.6012V37.4228H23.9096C23.963 37.4228 24.0142 37.4442 24.0519 37.4823C24.0897 37.5205 24.1109 37.5722 24.1109 37.6262C24.1109 37.6801 24.0897 37.7318 24.0519 37.77C24.0142 37.8081 23.9629 37.8296 23.9095 37.8296Z" fill="#00263E" />
      <path d="M24.4941 37.2988H24.3711V38.28H25.0151V38.1559H24.4941V37.2988Z" fill="#00263E" />
      <path d="M25.4697 37.2991C25.3737 37.2991 25.2799 37.3278 25.2001 37.3817C25.1203 37.4355 25.0581 37.512 25.0213 37.6016C24.9846 37.6911 24.975 37.7896 24.9937 37.8847C25.0124 37.9797 25.0586 38.067 25.1265 38.1355C25.1944 38.2041 25.2808 38.2507 25.375 38.2696C25.4691 38.2886 25.5667 38.2788 25.6554 38.2418C25.7441 38.2047 25.8199 38.1419 25.8732 38.0613C25.9265 37.9807 25.955 37.886 25.955 37.7891C25.9572 37.7241 25.9462 37.6594 25.9226 37.599C25.899 37.5385 25.8633 37.4836 25.8178 37.4376C25.7723 37.3917 25.7179 37.3557 25.658 37.3319C25.5981 37.308 25.534 37.2969 25.4697 37.2991ZM25.4697 38.1552C25.398 38.1552 25.3279 38.1337 25.2683 38.0935C25.2086 38.0533 25.1621 37.9961 25.1347 37.9292C25.1072 37.8623 25.1 37.7887 25.114 37.7177C25.128 37.6467 25.1625 37.5814 25.2132 37.5302C25.264 37.479 25.3286 37.4442 25.3989 37.43C25.4692 37.4159 25.5422 37.4231 25.6084 37.4508C25.6747 37.4785 25.7313 37.5255 25.7712 37.5857C25.811 37.6459 25.8323 37.7167 25.8323 37.7891C25.8345 37.8378 25.8267 37.8864 25.8092 37.9318C25.7918 37.9772 25.7652 38.0185 25.7311 38.053C25.6969 38.0874 25.6561 38.1143 25.6111 38.1319C25.5661 38.1495 25.5179 38.1574 25.4697 38.1552Z" fill="#00263E" />
      <defs>
        <linearGradient id="paint0_linear_2088_4549" x1="29.9921" y1="23.9999" x2="17.9922" y2="23.9999" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EAE0E5" />
          <stop offset="0.15" stopColor="#FAF8F9" />
          <stop offset="0.45" stopColor="#CBB3C0" />
          <stop offset="0.55" stopColor="#CBB3C0" />
          <stop offset="0.85" stopColor="#FAF8F9" />
          <stop offset="1" stopColor="#EAE0E5" />
        </linearGradient>
      </defs>
    </svg>
  ),
  "磨砂膏": (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="20" width="28" height="18" rx="2" fill="url(#paint0_linear_scrub)" />
      <path d="M10 24H38" stroke="#B795A7" strokeWidth="1.5" strokeLinecap="round" />
      <defs>
        <linearGradient id="paint0_linear_scrub" x1="38" y1="29" x2="10" y2="29" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EAE0E5" />
          <stop offset="0.5" stopColor="#CBB3C0" />
          <stop offset="1" stopColor="#EAE0E5" />
        </linearGradient>
      </defs>
    </svg>
  ),
  "面膜": (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="14" y="8" width="20" height="32" rx="2" fill="url(#paint0_linear_mask)" />
      <rect x="20" y="20" width="8" height="8" rx="4" stroke="#B795A7" strokeWidth="1.5" />
      <defs>
        <linearGradient id="paint0_linear_mask" x1="34" y1="24" x2="14" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EAE0E5" />
          <stop offset="0.5" stopColor="#CBB3C0" />
          <stop offset="1" stopColor="#EAE0E5" />
        </linearGradient>
      </defs>
    </svg>
  ),
  "精华": (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="18" y="15" width="12" height="28" rx="2" fill="url(#paint0_linear_serum)" />
      <rect x="21" y="5" width="6" height="10" rx="1" fill="#CBB3C0" />
      <defs>
        <linearGradient id="paint0_linear_serum" x1="30" y1="29" x2="18" y2="29" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EAE0E5" />
          <stop offset="0.5" stopColor="#CBB3C0" />
          <stop offset="1" stopColor="#EAE0E5" />
        </linearGradient>
      </defs>
    </svg>
  ),
  "面霜": (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="12" y="18" width="24" height="25" rx="2" fill="url(#paint0_linear_cream)" />
      <path d="M12 25H36" stroke="#B795A7" strokeWidth="1.5" />
      <defs>
        <linearGradient id="paint0_linear_cream" x1="36" y1="30" x2="12" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EAE0E5" />
          <stop offset="0.5" stopColor="#CBB3C0" />
          <stop offset="1" stopColor="#EAE0E5" />
        </linearGradient>
      </defs>
    </svg>
  ),
  "防晒": (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="15" y="10" width="18" height="33" rx="9" fill="url(#paint0_linear_sun)" />
      <circle cx="24" cy="22" r="4" stroke="#B795A7" strokeWidth="1.5" />
      <defs>
        <linearGradient id="paint0_linear_sun" x1="33" y1="26" x2="15" y2="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EAE0E5" />
          <stop offset="0.5" stopColor="#CBB3C0" />
          <stop offset="1" stopColor="#EAE0E5" />
        </linearGradient>
      </defs>
    </svg>
  ),
  "护手霜": (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 10H30V35C30 39.4183 26.4183 43 22 43H18V10Z" fill="url(#paint0_linear_hand)" />
      <rect x="20" y="5" width="8" height="5" fill="#CBB3C0" />
      <defs>
        <linearGradient id="paint0_linear_hand" x1="30" y1="26" x2="18" y2="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EAE0E5" />
          <stop offset="0.5" stopColor="#CBB3C0" />
          <stop offset="1" stopColor="#EAE0E5" />
        </linearGradient>
      </defs>
    </svg>
  ),
  "身体护理": (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="16" y="10" width="16" height="33" rx="4" fill="url(#paint0_linear_body)" />
      <path d="M16 18H32" stroke="#B795A7" strokeWidth="1.5" />
      <defs>
        <linearGradient id="paint0_linear_body" x1="32" y1="26" x2="16" y2="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EAE0E5" />
          <stop offset="0.5" stopColor="#CBB3C0" />
          <stop offset="1" stopColor="#EAE0E5" />
        </linearGradient>
      </defs>
    </svg>
  ),
  "护理油": (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="16" y="18" width="16" height="25" rx="2" fill="url(#paint0_linear_oil)" />
      <rect x="21" y="8" width="6" height="10" rx="1" fill="#CBB3C0" />
      <defs>
        <linearGradient id="paint0_linear_oil" x1="32" y1="30" x2="16" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EAE0E5" />
          <stop offset="0.5" stopColor="#CBB3C0" />
          <stop offset="1" stopColor="#EAE0E5" />
        </linearGradient>
      </defs>
    </svg>
  ),
  "礼盒套装": (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="15" width="28" height="25" rx="2" fill="url(#paint0_linear_gift)" />
      <path d="M10 22H38M24 15V40" stroke="#CBB3C0" strokeWidth="1.5" />
      <defs>
        <linearGradient id="paint0_linear_gift" x1="38" y1="27" x2="10" y2="27" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EAE0E5" />
          <stop offset="0.5" stopColor="#CBB3C0" />
          <stop offset="1" stopColor="#EAE0E5" />
        </linearGradient>
      </defs>
    </svg>
  ),

};


/**
 * 产品列表内容组件
 * 基于 First Page.html 的三列错落网格布局设计，放在可展开/收起的抽屉中
 */
export function ProductsContent({ categories, products }: ProductsContentProps) {
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
        className="safe-area-content !top-0 !pointer-events-none"
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* 主内容区域 + 展开按钮一体化 */}
        <m.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="h-full pointer-events-none"
        >
          {/* 主内容区域 + 按钮一体化容器 */}
          <div className="flex h-full flex-col items-center pointer-events-none">
            {/* 主内容区域 - 抽屉 */}
            <m.div
              className="relative w-full overflow-hidden rounded-b-2xl bg-[#F0EDE1] lg:rounded-b-3xl pointer-events-auto"
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
                      src="/images/logo.webp"
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
                <nav className="relative hidden h-[100px] flex-shrink-0 items-center justify-between border-b border-[#00263E]/10 px-[12%] lg:flex">
                  {/* Logo */}
                  <Link href="/">
                    <Image
                      src="/images/logo.webp"
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
                <div className="flex flex-1 flex-col justify-center overflow-hidden px-[5%] pb-4 lg:px-[12%]">
                  {/* Section Header - 紧凑样式 */}
                  <m.header
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] }}
                    className="mb-6 flex-shrink-0 lg:mb-10"
                  >
                    <span className="mb-1 hidden text-[12px] tracking-[0.15em] text-[#00263E]/60 lg:block lg:text-xs">
                      COLLECTION 2026
                    </span>
                    <h1 className="text-[24px] font-light tracking-[0.2em] text-[#00263E] lg:text-3xl">
                      当季热卖
                    </h1>
                  </m.header>

                  {/* 产品网格/轮播 - 移动端轮播，桌面端网格 */}
                  <section className="
                    flex w-full snap-x snap-mandatory overflow-x-auto pb-6 scrollbar-hide px-[7.5vw]
                    lg:grid lg:min-h-0 lg:grid-cols-3 lg:gap-10 lg:overflow-visible lg:pb-0 lg:px-0
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
                          "lg:w-auto lg:px-0 lg:h-auto lg:justify-start",
                          // 第二列：下沉布局，从 5% 恢复到 10%
                          index === 1 && "lg:mt-[10%]"
                        )}
                      >
                        {/* 图片容器 - 中间 4:5，两侧正方形 1:1 */}
                        <div className={cn(
                          "relative w-full overflow-hidden bg-white transition-all duration-700 ease-[cubic-bezier(0.19,1,0.22,1)] group-hover:-translate-y-1 group-hover:shadow-[0_20px_40px_rgba(0,38,62,0.1)]",
                          index === 1 ? "aspect-[4/5]" : "aspect-square"
                        )}>
                          {/* 内部装饰边框 */}
                          <div className="pointer-events-none absolute inset-3 border border-[#00263E]/[0.08] z-10" />
                          {product.images[0] && (
                            <Image
                              src={product.images[0].url}
                              alt={product.images[0].alt || product.name}
                              fill
                              className="object-cover object-center transition-transform duration-[1.2s] ease-[cubic-bezier(0.19,1,0.22,1)] group-hover:scale-[1.05]"
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
                  src="/images/watermark.webp"
                  alt=""
                  width={2000}
                  height={2000}
                  priority
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
              className="group -mt-[1px] relative z-10 flex items-center justify-center rounded-b-2xl bg-[#F0EDE1] px-10 py-3 shadow-sm transition-shadow hover:shadow-md lg:px-14 lg:py-3.5 pointer-events-auto"
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
                  src="/images/logo.webp"
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
                  className={cn(
                    "group flex w-full items-center justify-center gap-6 py-2 transition-transform active:scale-95",
                    index % 2 === 1 ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  <span className="relative block h-14 w-14 shrink-0 overflow-hidden">
                    {CATEGORY_ICONS[cat.name] ? (
                      <div className="flex h-full w-full items-center justify-center opacity-80 transition-opacity group-hover:opacity-100 [&>svg]:h-full [&>svg]:w-full">
                        {CATEGORY_ICONS[cat.name]}
                      </div>
                    ) : cat.icon && cat.icon.trim().startsWith("<svg") ? (
                      <span
                        className="flex h-full w-full items-center justify-center opacity-80 transition-opacity group-hover:opacity-100 [&>svg]:h-full [&>svg]:w-full"
                        dangerouslySetInnerHTML={{ __html: cat.icon }}
                      />
                    ) : cat.icon ? (
                      <Image
                        src={cat.icon}
                        alt=""
                        fill
                        className="object-contain opacity-80 transition-opacity group-hover:opacity-100"
                        sizes="64px"
                      />
                    ) : null}
                  </span>
                  <span className="text-[15px] font-medium tracking-wide text-[#1a1a1a] transition-colors group-hover:text-brand-gold">
                    {cat.name}
                  </span>
                  {/* <span className="text-[10px] uppercase tracking-wider text-[#1a1a1a]/40 transition-colors group-hover:text-brand-gold/70">
                    {cat.nameEn}
                  </span> */}
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

    </>
  );
}