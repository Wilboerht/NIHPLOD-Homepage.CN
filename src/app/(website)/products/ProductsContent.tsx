"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { m, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronLeft, ChevronRight, Menu, X } from "lucide-react";
import { ProductDrawer, ShopIcon, StoryIcon, RitualIcon, ContactIcon, HomeIcon } from "@/components/website";
import type { ProductData } from "@/components/website/ProductDrawer";
import { cn } from "@/lib/utils";

/**
 * 底部导航项配置
 */
const bottomNavItems = [
  { href: "/story", label: "关于旎柏", labelEn: "Story", icon: StoryIcon },
  { href: "/ritual", label: "护肤仪式", labelEn: "Ritual", icon: RitualIcon },
  { href: "/contact", label: "联系我们", labelEn: "Contact", icon: ContactIcon },
];

interface Category {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
  icon?: string | null;
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
  categoryId: string;
  category: Category;
  images: { url: string; alt: string | null }[];
  ingredients: string | null;
  usage: string | null;
  benefits: string[];
}

interface ProductsContentProps {
  categories: Category[];
  products: Product[];
}

/**
 * 分类图标 SVG 组件
 * 优先使用数据库中的图标，如果没有则使用默认图标
 */
function CategoryIcon({ icon, isActive }: { icon?: string | null; isActive: boolean }) {
  const color = isActive ? "#C9A86C" : "#8B8579";
  const iconClass = "h-7 w-7 sm:h-8 sm:w-8 md:h-10 md:w-10 lg:h-12 lg:w-12 flex-shrink-0";

  // 如果有自定义图标，使用 dangerouslySetInnerHTML 渲染
  if (icon) {
    // 将 currentColor 替换为实际颜色，并确保 SVG 填充容器
    const coloredIcon = icon
      .replace(/currentColor/g, color)
      .replace(/<svg/, '<svg class="w-full h-full"');
    return (
      <div
        className={iconClass}
        style={{ color }}
        dangerouslySetInnerHTML={{ __html: coloredIcon }}
      />
    );
  }

  // 默认图标
  return (
    <svg viewBox="0 0 40 40" className={iconClass}>
      <rect x="10" y="10" width="20" height="20" rx="4" fill={color} />
    </svg>
  );
}

/**
 * 产品列表内容组件
 * Client Component - 处理分类筛选和产品展示
 */
export function ProductsContent({ categories, products }: ProductsContentProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentProductIndex, setCurrentProductIndex] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductData | null>(null);
  const [isNavMenuOpen, setIsNavMenuOpen] = useState(false);

  // 按分类顺序排列产品
  const sortedProducts = useMemo(() => {
    const categoryOrder = new Map(categories.map((cat, index) => [cat.id, index]));
    return [...products].sort((a, b) => {
      const orderA = categoryOrder.get(a.categoryId) ?? 999;
      const orderB = categoryOrder.get(b.categoryId) ?? 999;
      return orderA - orderB;
    });
  }, [categories, products]);

  // 当前展示的产品（轮播显示所有产品，按分类顺序）
  const currentProduct = sortedProducts[currentProductIndex] || null;

  // 切换到上一个产品
  const handlePrevProduct = () => {
    setCurrentProductIndex((prev) =>
      prev === 0 ? sortedProducts.length - 1 : prev - 1
    );
    // 更新高亮的分类
    const prevIndex = currentProductIndex === 0 ? sortedProducts.length - 1 : currentProductIndex - 1;
    setActiveCategory(sortedProducts[prevIndex]?.categoryId || null);
  };

  // 切换到下一个产品
  const handleNextProduct = () => {
    setCurrentProductIndex((prev) =>
      prev === sortedProducts.length - 1 ? 0 : prev + 1
    );
    // 更新高亮的分类
    const nextIndex = currentProductIndex === sortedProducts.length - 1 ? 0 : currentProductIndex + 1;
    setActiveCategory(sortedProducts[nextIndex]?.categoryId || null);
  };

  // 点击分类时跳转到该分类的第一个产品并展开
  const handleCategoryChange = (categoryId: string) => {
    // 重复点击同一分类不取消选中，直接返回
    if (categoryId === activeCategory) {
      return;
    }
    const firstProductIndex = sortedProducts.findIndex((p) => p.categoryId === categoryId);
    if (firstProductIndex !== -1) {
      setActiveCategory(categoryId);
      setCurrentProductIndex(firstProductIndex);
    }
    // 点击分类时自动展开商品卡片
    setIsExpanded(true);
  };

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
    setDrawerOpen(true);
  };

  // 关闭抽屉
  const handleCloseDrawer = () => {
    setDrawerOpen(false);
  };

  return (
    <>
      {/* 全屏背景图片 - 始终全屏显示，不受展开/收起影响 */}
      <div className="fixed inset-0 z-0">
        <Image
          src="/images/bg.png"
          alt="NIHPLOD 产品系列"
          fill
          priority
          quality={100}
          className="object-cover"
          sizes="100vw"
        />
      </div>

      {/* 内容区域容器 - 展开时延伸到底部 */}
      <div className={cn(
        "fixed inset-0 z-10 transition-all duration-300",
        isExpanded ? "bottom-0" : "bottom-28 lg:bottom-32"
      )}>
        {/* 顶部分类导航栏 + 展开按钮一体化 */}
        <m.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="absolute left-2 right-2 top-2 z-30 sm:left-4 sm:right-4 sm:top-4 lg:left-6 lg:right-6 lg:top-6"
        >
          {/* 分类栏 + 按钮一体化容器 */}
          <div className="flex flex-col items-center">
            {/* 分类图标区域 */}
            <div className="w-full rounded-xl bg-[#EBE8DB] sm:w-fit sm:rounded-2xl lg:rounded-3xl">
              <div className="px-2 py-2 sm:px-8 sm:py-3 md:px-12 lg:px-20 lg:py-4">
                {/* 移动端：grid 5列，桌面端：flex 单行 */}
                <div className="grid grid-cols-5 gap-x-0 gap-y-1 sm:flex sm:items-center sm:justify-center sm:gap-4 md:gap-8 lg:gap-14">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleCategoryChange(cat.id)}
                      className={cn(
                        "flex flex-col items-center gap-0.5 px-1.5 py-1.5 transition-all sm:gap-1 sm:px-3 sm:py-2 lg:px-4 lg:py-2.5",
                        "rounded-lg hover:bg-brand-beige/30 sm:rounded-xl",
                        activeCategory === cat.id && "bg-brand-beige/50"
                      )}
                    >
                      <CategoryIcon icon={cat.icon} isActive={activeCategory === cat.id} />
                      <span className={cn(
                        "text-[10px] whitespace-nowrap sm:text-[11px] md:text-xs lg:text-sm",
                        activeCategory === cat.id ? "text-brand-gold font-medium" : "text-brand-charcoal/70"
                      )}>
                        {cat.name}
                      </span>
                      <span className={cn(
                        "font-serif text-[7px] uppercase tracking-wide whitespace-nowrap sm:text-[9px] md:text-[10px] lg:text-xs",
                        activeCategory === cat.id ? "text-brand-gold/80" : "text-brand-charcoal/50"
                      )}>
                        {cat.nameEn}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {/* 展开/收起按钮 - 无缝连接 */}
            <button
              type="button"
              onClick={() => {
                if (isExpanded) {
                  // 收起时清除分类选中状态
                  setActiveCategory(null);
                } else {
                  // 展开时自动选中当前产品的分类
                  setActiveCategory(currentProduct?.categoryId || null);
                }
                setIsExpanded(!isExpanded);
              }}
              className="group flex items-center justify-center rounded-b-xl bg-[#EBE8DB] px-6 py-2 shadow-sm sm:rounded-b-2xl sm:px-10 sm:py-2.5 lg:px-14 lg:py-3"
            >
              <m.div
                className="flex flex-col items-center transition-transform duration-200 group-hover:scale-110"
                animate={{ rotate: isExpanded ? 180 : 0 }}
                transition={{ duration: 0.3 }}
              >
                <ChevronDown className="h-5 w-5 text-brand-gold transition-colors duration-200 group-hover:text-brand-gold/80 sm:h-6 sm:w-6 lg:h-8 lg:w-8" />
                <ChevronDown className="-mt-3 h-5 w-5 text-brand-gold transition-colors duration-200 group-hover:text-brand-gold/80 sm:-mt-4 sm:h-6 sm:w-6 lg:-mt-5 lg:h-8 lg:w-8" />
              </m.div>
            </button>
          </div>
        </m.div>

        {/* 产品展示区域 - 3D 旋转木马 */}
        <AnimatePresence>
          {isExpanded && currentProduct && (
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="absolute inset-x-0 bottom-2 top-36 z-10 sm:bottom-4 sm:top-40 md:top-44 lg:bottom-6 lg:top-48"
              style={{ perspective: "1200px" }}
            >
              <div className="relative mx-auto flex h-full max-w-6xl items-center justify-center px-2 sm:px-4">
                {/* 五张卡片容器：左2、中1、右2 */}
                {sortedProducts.map((product, index) => {
                  // 计算相对位置：-2=左2, -1=左1, 0=中, 1=右1, 2=右2
                  const diff = index - currentProductIndex;
                  const normalizedDiff =
                    diff > sortedProducts.length / 2 ? diff - sortedProducts.length :
                    diff < -sortedProducts.length / 2 ? diff + sortedProducts.length : diff;

                  // 只渲染5张卡片（左2、左1、中、右1、右2）
                  if (Math.abs(normalizedDiff) > 2) return null;

                  const isCenter = normalizedDiff === 0;
                  const isLeft1 = normalizedDiff === -1;
                  const isLeft2 = normalizedDiff === -2;
                  const isRight1 = normalizedDiff === 1;
                  const isRight2 = normalizedDiff === 2;

                  // 计算位置、缩放、透明度、旋转
                  // 移动端和PC端使用不同参数
                  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
                  const getTransform = () => {
                    if (isCenter) return { x: "0%", scale: 1, zIndex: 20, opacity: 1, rotateY: 0 };
                    if (isMobile) {
                      // 移动端：左右卡片靠近中心
                      if (isLeft1) return { x: "-55%", scale: 0.82, zIndex: 15, opacity: 0.7, rotateY: 6 };
                      if (isRight1) return { x: "55%", scale: 0.82, zIndex: 15, opacity: 0.7, rotateY: -6 };
                      if (isLeft2) return { x: "-95%", scale: 0.65, zIndex: 10, opacity: 0, rotateY: 10 };
                      if (isRight2) return { x: "95%", scale: 0.65, zIndex: 10, opacity: 0, rotateY: -10 };
                    } else {
                      // PC端
                      if (isLeft1) return { x: "-52%", scale: 0.75, zIndex: 15, opacity: 0.6, rotateY: 15 };
                      if (isRight1) return { x: "52%", scale: 0.75, zIndex: 15, opacity: 0.6, rotateY: -15 };
                      if (isLeft2) return { x: "-90%", scale: 0.55, zIndex: 10, opacity: 0.3, rotateY: 25 };
                      if (isRight2) return { x: "90%", scale: 0.55, zIndex: 10, opacity: 0.3, rotateY: -25 };
                    }
                    return { x: "0%", scale: 0, zIndex: 0, opacity: 0, rotateY: 0 };
                  };

                  const transform = getTransform();

                  return (
                    <m.div
                      key={product.id}
                      initial={false}
                      animate={transform}
                      transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
                      onClick={() => {
                        if (isLeft1 || isLeft2) handlePrevProduct();
                        if (isRight1 || isRight2) handleNextProduct();
                      }}
                      className={cn(
                        // 卡片基础样式
                        "absolute overflow-hidden",
                        // 移动端：竖向卡片（上图下文）
                        "flex w-[58%] max-w-[240px] flex-col rounded-2xl",
                        // PC端：横向卡片（左文右图）
                        "sm:aspect-[16/10] sm:h-auto sm:w-[480px] sm:max-w-none sm:flex-row sm:rounded-2xl",
                        "md:w-[560px] lg:w-[640px] lg:rounded-3xl",
                        isCenter
                          ? "cursor-default bg-white shadow-2xl ring-1 ring-black/5"
                          : "cursor-pointer bg-white/90 shadow-lg ring-1 ring-black/5 sm:bg-white/60 sm:shadow-xl sm:ring-0 sm:backdrop-blur-sm sm:hover:bg-white/70"
                      )}
                      style={{ transformStyle: "preserve-3d" }}
                    >
                      {isCenter ? (
                        <>
                          {/* ===== 移动端：图片在上 / PC端：图片在右 ===== */}
                          <div className="w-full p-4 sm:order-2 sm:flex sm:w-[55%] sm:items-center sm:justify-center sm:p-5 md:p-6 lg:p-7">
                            <div className="relative aspect-square w-full overflow-hidden rounded-xl sm:h-full sm:w-auto md:rounded-2xl">
                              {product.images[0] && (
                                <Image
                                  src={product.images[0].url}
                                  alt={product.images[0].alt || product.name}
                                  fill
                                  className="object-cover drop-shadow-lg"
                                  sizes="(max-width: 640px) 200px, (max-width: 768px) 250px, 300px"
                                  priority
                                />
                              )}
                            </div>
                          </div>

                          {/* ===== 移动端：文字在下 / PC端：文字在左 ===== */}
                          <div className="flex w-full flex-col items-center px-4 pb-4 pt-2 sm:order-1 sm:w-[45%] sm:items-start sm:justify-center sm:p-6 md:p-7 lg:p-8">
                            {/* 产品名称 */}
                            <h2 className="text-center text-xl font-medium tracking-wide text-brand-charcoal sm:text-left sm:text-xl md:text-2xl lg:text-[26px]">
                              {product.name}
                            </h2>

                            {/* 英文名 */}
                            <p className="mt-1.5 font-serif text-[11px] uppercase tracking-widest text-brand-gold/70 sm:mt-1.5 sm:text-xs md:text-[13px]">
                              {product.nameEn}
                            </p>

                            {/* 分隔线 - 移动端居中 */}
                            <div className="mt-2.5 h-px w-10 bg-gradient-to-r from-transparent via-brand-gold/40 to-transparent sm:mt-4 sm:w-12 sm:bg-gradient-to-r sm:from-brand-gold/40 sm:to-transparent md:w-14 lg:w-16" />

                            {/* 功效 - 移动端隐藏 */}
                            {product.benefits && product.benefits.length > 0 && (
                              <p className="mt-2 hidden text-xs leading-relaxed text-brand-charcoal/60 sm:mt-3 sm:line-clamp-2 sm:block md:text-[13px]">
                                {product.benefits.slice(0, 3).join(" · ")}
                              </p>
                            )}

                            {/* 价格 */}
                            <div className="mt-2.5 flex items-baseline gap-1 sm:mt-5 sm:gap-1.5">
                              <span className="text-xl font-light text-brand-gold sm:text-2xl md:text-3xl lg:text-[32px]">
                                ¥{product.price}
                              </span>
                              {product.capacity && (
                                <span className="text-[10px] text-brand-charcoal/40 sm:text-xs">
                                  / {product.capacity}
                                </span>
                              )}
                            </div>

                            {/* 按钮 */}
                            <div className="mt-3 flex gap-2 sm:mt-6 sm:gap-3">
                              <button
                                type="button"
                                onClick={() => handleProductClick(product)}
                                className="rounded-full border border-brand-charcoal/20 px-4 py-1.5 text-[11px] font-medium text-brand-charcoal transition-all hover:border-brand-charcoal/40 hover:bg-brand-charcoal/5 sm:px-5 sm:py-2 sm:text-xs md:px-6 md:py-2.5 md:text-sm"
                              >
                                了解详情
                              </button>
                              {product.purchaseUrl && (
                                <a
                                  href={product.purchaseUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded-full bg-brand-charcoal px-4 py-1.5 text-[11px] font-medium text-white transition-all hover:bg-brand-charcoal/85 sm:px-5 sm:py-2 sm:text-xs md:px-6 md:py-2.5 md:text-sm"
                                >
                                  立即购买
                                </a>
                              )}
                            </div>
                          </div>
                        </>
                      ) : (
                        /* 侧边卡片 - 简洁的图片展示 */
                        <div className="flex h-full w-full flex-col items-center justify-center p-4 sm:aspect-[16/10] sm:p-0">
                          {/* 移动端：显示图片和产品名 */}
                          <div className="relative aspect-square w-full overflow-hidden rounded-xl sm:h-full sm:w-full sm:rounded-none">
                            {product.images[0] && (
                              <Image
                                src={product.images[0].url}
                                alt={product.name}
                                fill
                                className="object-cover sm:object-contain sm:p-10 sm:opacity-50 sm:blur-[2px]"
                                sizes="(max-width: 640px) 50vw, 280px"
                              />
                            )}
                          </div>
                          {/* 移动端：产品名称 */}
                          <p className="mt-2 text-center text-xs font-medium text-brand-charcoal/70 sm:hidden">
                            {product.name}
                          </p>
                        </div>
                      )}
                    </m.div>
                  );
                })}

                {/* 左右箭头 */}
                <button
                  type="button"
                  onClick={handlePrevProduct}
                  className="absolute left-0 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-brand-charcoal shadow-md backdrop-blur-sm transition-all hover:scale-110 hover:bg-white sm:h-10 sm:w-10 sm:shadow-lg md:h-11 md:w-11 lg:left-2"
                >
                  <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6" />
                </button>
                <button
                  type="button"
                  onClick={handleNextProduct}
                  className="absolute right-0 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-brand-charcoal shadow-md backdrop-blur-sm transition-all hover:scale-110 hover:bg-white sm:h-10 sm:w-10 sm:shadow-lg md:h-11 md:w-11 lg:right-2"
                >
                  <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6" />
                </button>

                {/* 底部指示点 - 移动端隐藏 */}
                <div className="absolute bottom-2 left-1/2 z-30 hidden -translate-x-1/2 gap-2 sm:flex">
                  {sortedProducts.map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => {
                        setCurrentProductIndex(index);
                        setActiveCategory(sortedProducts[index]?.categoryId || null);
                      }}
                      className={cn(
                        "h-2 rounded-full transition-all",
                        index === currentProductIndex
                          ? "w-6 bg-brand-gold"
                          : "w-2 bg-brand-charcoal/30 hover:bg-brand-charcoal/50"
                      )}
                    />
                  ))}
                </div>
              </div>
            </m.div>
          )}
        </AnimatePresence>

        {/* 无产品提示 */}
        <AnimatePresence>
          {isExpanded && sortedProducts.length === 0 && (
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-x-4 bottom-4 top-44 z-10 flex items-center justify-center lg:inset-x-6 lg:bottom-6 lg:top-48"
            >
              <div className="rounded-2xl bg-white/90 px-8 py-6 shadow-xl backdrop-blur-md">
                <p className="text-brand-charcoal/50">暂无产品</p>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>

      {/* 移动端菜单遮罩层 */}
      <AnimatePresence>
        {isNavMenuOpen && !isExpanded && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm sm:hidden"
            onClick={() => setIsNavMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* 移动端弹出菜单 */}
      <AnimatePresence>
        {isNavMenuOpen && !isExpanded && (
          <m.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="fixed bottom-20 right-3 z-50 w-44 rounded-2xl bg-white/95 p-2 shadow-xl backdrop-blur-md sm:hidden"
          >
            <div className="flex flex-col gap-1">
              {/* 首页 */}
              <Link
                href="/"
                onClick={() => setIsNavMenuOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors active:bg-brand-beige/50"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gold/10">
                  <HomeIcon className="h-5 w-5" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-brand-charcoal">首页</span>
                  <span className="font-serif text-[9px] uppercase tracking-wide text-brand-charcoal/50">Home</span>
                </div>
              </Link>
              {/* 其他导航项 */}
              {bottomNavItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsNavMenuOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors active:bg-brand-beige/50"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gold/10">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-brand-charcoal">{item.label}</span>
                      <span className="font-serif text-[9px] uppercase tracking-wide text-brand-charcoal/50">{item.labelEn}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {/* 底部导航栏 - 展开时隐藏 */}
      <AnimatePresence>
        {!isExpanded && (
          <m.header
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed bottom-2 left-3 right-3 z-50 sm:bottom-4 sm:left-6 sm:right-6 lg:bottom-6 lg:left-16 lg:right-16"
            role="banner"
          >
            <nav
              className={cn(
                "flex items-center justify-between",
                // 移动端：更紧凑的设计
                "rounded-2xl bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur-md",
                // 平板和桌面端
                "sm:px-5 sm:py-4 lg:rounded-3xl lg:px-8 lg:py-5"
              )}
              aria-label="产品页导航"
            >
              {/* 左侧主导航 - 商城 */}
              <Link
                href="/products"
                className="group flex items-center gap-2 transition-opacity active:opacity-70 sm:gap-4 sm:hover:opacity-80"
              >
                {/* 图标容器 */}
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gold/10 sm:h-16 sm:w-16 lg:h-20 lg:w-20">
                  <ShopIcon className="h-6 w-6 sm:h-10 sm:w-10 lg:h-14 lg:w-14" />
                </div>
                {/* 文字 */}
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-brand-charcoal sm:text-lg lg:text-2xl">
                    商城
                  </span>
                  <span className="font-serif text-[10px] uppercase tracking-wide text-brand-gold/70 sm:text-xs lg:text-base">
                    Products
                  </span>
                </div>
              </Link>

              {/* 移动端：菜单按钮 */}
              <button
                type="button"
                onClick={() => setIsNavMenuOpen(!isNavMenuOpen)}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-beige/30 transition-colors active:bg-brand-beige/50 sm:hidden"
                aria-label={isNavMenuOpen ? "关闭菜单" : "打开菜单"}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {isNavMenuOpen ? (
                    <m.div
                      key="close"
                      initial={{ opacity: 0, rotate: -90 }}
                      animate={{ opacity: 1, rotate: 0 }}
                      exit={{ opacity: 0, rotate: 90 }}
                      transition={{ duration: 0.15 }}
                    >
                      <X className="h-5 w-5 text-brand-charcoal" />
                    </m.div>
                  ) : (
                    <m.div
                      key="menu"
                      initial={{ opacity: 0, rotate: 90 }}
                      animate={{ opacity: 1, rotate: 0 }}
                      exit={{ opacity: 0, rotate: -90 }}
                      transition={{ duration: 0.15 }}
                    >
                      <Menu className="h-5 w-5 text-brand-charcoal" />
                    </m.div>
                  )}
                </AnimatePresence>
              </button>

              {/* 平板/桌面端：直接显示导航图标 */}
              <div className="hidden items-center gap-5 sm:flex lg:gap-8">
                {bottomNavItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="group flex flex-col items-center gap-1 transition-opacity hover:opacity-80"
                    >
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl transition-colors group-hover:bg-brand-beige/50 lg:h-16 lg:w-16">
                        <Icon className="h-8 w-8 lg:h-9 lg:w-9" />
                      </div>
                      <span className="text-xs text-brand-charcoal/70 lg:text-sm">
                        {item.label}
                      </span>
                      <span className="font-serif text-[10px] uppercase tracking-wide text-brand-charcoal/50 lg:text-xs">
                        {item.labelEn}
                      </span>
                    </Link>
                  );
                })}
                {/* 回到首页按钮 */}
                <Link
                  href="/"
                  className="group flex flex-col items-center gap-1 transition-opacity hover:opacity-80"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl transition-colors group-hover:bg-brand-beige/50 lg:h-16 lg:w-16">
                    <HomeIcon className="h-8 w-8 lg:h-9 lg:w-9" />
                  </div>
                  <span className="text-xs text-brand-charcoal/70 lg:text-sm">
                    首页
                  </span>
                  <span className="font-serif text-[10px] uppercase tracking-wide text-brand-charcoal/50 lg:text-xs">
                    Home
                  </span>
                </Link>
              </div>
            </nav>
          </m.header>
        )}
      </AnimatePresence>

      {/* 产品详情抽屉 */}
      <ProductDrawer
        isOpen={drawerOpen}
        onClose={handleCloseDrawer}
        product={selectedProduct}
      />
    </>
  );
}

