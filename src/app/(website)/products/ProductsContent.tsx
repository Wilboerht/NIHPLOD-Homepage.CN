"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { m, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronLeft, ChevronRight, ShoppingBag, BookMarked, Sparkles, Phone, Home } from "lucide-react";
import { ProductDrawer } from "@/components/website";
import type { ProductData } from "@/components/website/ProductDrawer";
import { cn } from "@/lib/utils";

/**
 * 底部导航项配置
 */
const bottomNavItems = [
  { href: "/story", label: "关于旎柏", labelEn: "Story", icon: BookMarked },
  { href: "/ritual", label: "护肤仪式", labelEn: "Ritual", icon: Sparkles },
  { href: "/contact", label: "联系我们", labelEn: "Contact", icon: Phone },
];

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
 * 根据分类名称返回对应的产品形状图标
 */
function CategoryIcon({ name, isActive }: { name: string; isActive: boolean }) {
  const color = isActive ? "#C9A86C" : "#8B8579";
  const iconClass = "h-8 w-8 sm:h-10 sm:w-10 lg:h-12 lg:w-12";

  // 根据分类名称返回不同的图标形状
  const iconMap: Record<string, JSX.Element> = {
    "洁面": (
      <svg viewBox="0 0 40 40" className={iconClass}>
        <ellipse cx="20" cy="20" rx="6" ry="16" fill={color} />
      </svg>
    ),
    "磨砂膏": (
      <svg viewBox="0 0 40 40" className={iconClass}>
        <rect x="8" y="16" width="24" height="16" rx="3" fill={color} />
        <rect x="12" y="12" width="16" height="6" rx="2" fill={color} opacity="0.7" />
      </svg>
    ),
    "面膜": (
      <svg viewBox="0 0 40 40" className={iconClass}>
        <rect x="8" y="10" width="24" height="22" rx="2" fill={color} />
        <rect x="12" y="6" width="16" height="6" rx="1" fill={color} opacity="0.7" />
      </svg>
    ),
    "精华": (
      <svg viewBox="0 0 40 40" className={iconClass}>
        <rect x="14" y="6" width="12" height="28" rx="3" fill={color} />
        <rect x="12" y="4" width="16" height="4" rx="2" fill={color} opacity="0.7" />
      </svg>
    ),
    "面霜": (
      <svg viewBox="0 0 40 40" className={iconClass}>
        <rect x="6" y="12" width="28" height="20" rx="3" fill={color} />
        <rect x="10" y="8" width="20" height="6" rx="2" fill={color} opacity="0.7" />
      </svg>
    ),
    "防晒": (
      <svg viewBox="0 0 40 40" className={iconClass}>
        <circle cx="20" cy="22" r="12" fill={color} />
        <rect x="16" y="4" width="8" height="8" rx="2" fill={color} opacity="0.7" />
      </svg>
    ),
    "护手霜": (
      <svg viewBox="0 0 40 40" className={iconClass}>
        <ellipse cx="20" cy="22" rx="8" ry="14" fill={color} />
        <rect x="16" y="4" width="8" height="6" rx="2" fill={color} opacity="0.7" />
      </svg>
    ),
    "身体护理": (
      <svg viewBox="0 0 40 40" className={iconClass}>
        <ellipse cx="20" cy="24" rx="10" ry="12" fill={color} />
        <rect x="16" y="6" width="8" height="8" rx="2" fill={color} opacity="0.7" />
      </svg>
    ),
    "护理油": (
      <svg viewBox="0 0 40 40" className={iconClass}>
        <ellipse cx="20" cy="26" rx="8" ry="10" fill={color} />
        <rect x="17" y="6" width="6" height="12" rx="2" fill={color} opacity="0.7" />
      </svg>
    ),
    "礼盒套装": (
      <svg viewBox="0 0 40 40" className={iconClass}>
        <rect x="6" y="14" width="28" height="20" rx="3" fill={color} />
        <rect x="18" y="6" width="4" height="28" rx="1" fill={color} opacity="0.5" />
        <rect x="6" y="18" width="28" height="4" rx="1" fill={color} opacity="0.5" />
      </svg>
    ),
  };

  // 默认图标
  const defaultIcon = (
    <svg viewBox="0 0 40 40" className="h-10 w-10 lg:h-12 lg:w-12">
      <rect x="10" y="10" width="20" height="20" rx="4" fill={color} />
    </svg>
  );

  return iconMap[name] || defaultIcon;
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
      {/* 全屏背景容器 - 展开时延伸到底部 */}
      <div className={cn(
        "fixed inset-0 transition-all duration-300",
        isExpanded ? "bottom-0" : "bottom-28 lg:bottom-32"
      )}>
        {/* 背景图片 */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/images/products-hero.jpg"
            alt="NIHPLOD 产品系列"
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
        </div>

        {/* 顶部分类导航栏 + 展开按钮一体化 */}
        <m.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="absolute left-4 right-4 top-4 z-20 lg:left-6 lg:right-6 lg:top-6"
        >
          {/* 分类栏 + 按钮一体化容器 */}
          <div className="flex flex-col items-center">
            {/* 分类图标区域 */}
            <div className="w-fit max-w-full overflow-hidden rounded-2xl bg-brand-gold/10 backdrop-blur-md lg:rounded-3xl">
              <div className="px-10 py-2 sm:px-16 sm:py-3 lg:px-20 lg:py-4">
                <div className="flex items-center justify-start gap-2 overflow-x-auto sm:justify-center sm:gap-6 md:gap-10 lg:gap-14">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleCategoryChange(cat.id)}
                      className={cn(
                        "flex flex-shrink-0 flex-col items-center gap-0.5 px-1.5 py-1 transition-all sm:gap-1 sm:px-2 sm:py-1.5 lg:px-3 lg:py-2",
                        "rounded-xl hover:bg-brand-beige/30",
                        activeCategory === cat.id && "bg-brand-beige/50"
                      )}
                    >
                      <CategoryIcon name={cat.name} isActive={activeCategory === cat.id} />
                      <span className={cn(
                        "text-[10px] whitespace-nowrap sm:text-xs lg:text-sm",
                        activeCategory === cat.id ? "text-brand-gold font-medium" : "text-brand-charcoal/70"
                      )}>
                        {cat.name}
                      </span>
                      <span className={cn(
                        "font-serif text-[8px] uppercase tracking-wide whitespace-nowrap sm:text-[10px] lg:text-xs",
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
              className="group flex items-center justify-center rounded-b-2xl bg-brand-gold/10 px-10 py-2.5 shadow-sm backdrop-blur-md lg:px-14 lg:py-3"
            >
              <m.div
                className="flex flex-col items-center transition-transform duration-200 group-hover:scale-110"
                animate={{ rotate: isExpanded ? 180 : 0 }}
                transition={{ duration: 0.3 }}
              >
                <ChevronDown className="h-7 w-7 text-brand-gold transition-colors duration-200 group-hover:text-brand-gold/80 lg:h-8 lg:w-8" />
                <ChevronDown className="h-7 w-7 -mt-5 text-brand-gold transition-colors duration-200 group-hover:text-brand-gold/80 lg:h-8 lg:w-8" />
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
              className="absolute inset-x-0 bottom-4 top-32 z-10 sm:top-36 lg:bottom-6 lg:top-40"
              style={{ perspective: "1200px" }}
            >
              <div className="relative mx-auto flex h-full max-w-6xl items-center justify-center px-4">
                {/* 三张卡片容器 */}
                {sortedProducts.map((product, index) => {
                  // 计算相对位置：-1=左, 0=中, 1=右, 其他隐藏
                  const diff = index - currentProductIndex;
                  const normalizedDiff =
                    diff > sortedProducts.length / 2 ? diff - sortedProducts.length :
                    diff < -sortedProducts.length / 2 ? diff + sortedProducts.length : diff;

                  // 只渲染当前、左、右三张卡片
                  if (Math.abs(normalizedDiff) > 1) return null;

                  const isCenter = normalizedDiff === 0;
                  const isLeft = normalizedDiff === -1;

                  return (
                    <m.div
                      key={product.id}
                      initial={false}
                      animate={{
                        x: isCenter ? "0%" : isLeft ? "-65%" : "65%",
                        scale: isCenter ? 1 : 0.75,
                        zIndex: isCenter ? 20 : 10,
                        opacity: isCenter ? 1 : 0.5,
                        rotateY: isCenter ? 0 : isLeft ? 25 : -25,
                      }}
                      transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                      onClick={() => !isCenter && (isLeft ? handlePrevProduct() : handleNextProduct())}
                      className={cn(
                        "absolute flex h-[85%] max-h-[400px] w-[90%] max-w-2xl flex-col overflow-hidden rounded-2xl shadow-2xl sm:h-[90%] sm:max-h-[480px] sm:w-full lg:flex-row lg:rounded-3xl",
                        isCenter
                          ? "cursor-default bg-white/80 backdrop-blur-md"
                          : "cursor-pointer bg-white/50 backdrop-blur-sm"
                      )}
                      style={{ transformStyle: "preserve-3d" }}
                    >
                      {isCenter ? (
                        <>
                          {/* 中心卡片 - 完整内容 */}
                          <div className="flex flex-col justify-center p-3 sm:p-5 lg:w-2/5 lg:p-7">
                            <h2 className="text-lg font-semibold text-brand-charcoal sm:text-xl lg:text-2xl">
                              {product.name}
                            </h2>
                            <p className="mt-0.5 font-serif text-xs uppercase tracking-wider text-brand-gold sm:mt-1 sm:text-sm lg:text-base">
                              {product.nameEn}
                            </p>
                            {product.benefits && product.benefits.length > 0 && (
                              <p className="mt-2 text-[10px] text-brand-charcoal/70 sm:mt-3 sm:text-xs lg:text-sm">
                                {product.benefits.slice(0, 3).join(" | ")}
                              </p>
                            )}
                            <p className="mt-2 text-base font-medium sm:mt-4 sm:text-lg lg:text-xl">
                              <span className="text-brand-gold">¥{product.price}</span>
                              {product.capacity && (
                                <span className="text-xs text-brand-charcoal/50 sm:text-sm">/{product.capacity}</span>
                              )}
                            </p>
                            <div className="mt-2 flex gap-2 sm:mt-4 sm:gap-3">
                              <button
                                type="button"
                                onClick={() => handleProductClick(product)}
                                className="rounded-lg border border-brand-charcoal/30 px-3 py-1.5 text-xs text-brand-charcoal transition-colors hover:bg-brand-charcoal/5 sm:px-4 sm:py-2 sm:text-sm"
                              >
                                了解详情
                              </button>
                              {product.purchaseUrl && (
                                <a
                                  href={product.purchaseUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded-lg bg-brand-charcoal px-3 py-1.5 text-xs text-white transition-colors hover:bg-brand-charcoal/90 sm:px-4 sm:py-2 sm:text-sm"
                                >
                                  立即购买
                                </a>
                              )}
                            </div>
                          </div>
                          <div className="relative flex-1 lg:w-3/5">
                            <div className="absolute inset-0 flex items-center justify-center p-4">
                              {product.images[0] && (
                                <div className="relative h-full w-full">
                                  <Image
                                    src={product.images[0].url}
                                    alt={product.images[0].alt || product.name}
                                    fill
                                    className="object-contain"
                                    sizes="50vw"
                                    priority
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        </>
                      ) : (
                        /* 侧边卡片 - 虚化效果 */
                        <div className="relative h-full w-full blur-[3px]">
                          {product.images[0] && (
                            <Image
                              src={product.images[0].url}
                              alt=""
                              fill
                              className="object-contain p-8"
                              sizes="40vw"
                            />
                          )}
                        </div>
                      )}
                    </m.div>
                  );
                })}

                {/* 左右箭头 */}
                <button
                  type="button"
                  onClick={handlePrevProduct}
                  className="absolute left-0 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-white/80 text-brand-charcoal shadow-lg backdrop-blur-sm transition-all hover:bg-white hover:scale-110 lg:left-2"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={handleNextProduct}
                  className="absolute right-0 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-white/80 text-brand-charcoal shadow-lg backdrop-blur-sm transition-all hover:bg-white hover:scale-110 lg:right-2"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>

                {/* 底部指示点 */}
                <div className="absolute bottom-2 left-1/2 z-30 flex -translate-x-1/2 gap-2">
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

      {/* 底部导航栏 - 展开时隐藏 */}
      <AnimatePresence>
        {!isExpanded && (
          <m.header
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed bottom-4 left-6 right-6 z-50 sm:left-10 sm:right-10 lg:bottom-6 lg:left-16 lg:right-16"
            role="banner"
          >
            <nav
              className={cn(
                "flex items-center justify-between",
                "rounded-2xl bg-white/95 px-5 py-4 shadow-lg backdrop-blur-md",
                "lg:rounded-3xl lg:px-8 lg:py-5"
              )}
              aria-label="产品页导航"
            >
              {/* 左侧主导航 - 商城 */}
              <Link
                href="/products"
                className="group flex items-center gap-2 transition-opacity hover:opacity-80 sm:gap-4"
              >
                {/* 图标容器 */}
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gold/10 sm:h-12 sm:w-12 lg:h-14 lg:w-14">
                  <ShoppingBag className="h-5 w-5 text-brand-gold sm:h-6 sm:w-6 lg:h-7 lg:w-7" />
                </div>
                {/* 文字 */}
                <div className="flex flex-col">
                  <span className="text-lg font-semibold text-brand-charcoal sm:text-xl lg:text-2xl">
                    商城
                  </span>
                  <span className="font-serif text-xs uppercase tracking-wide text-brand-gold/70 sm:text-sm lg:text-base">
                    Products
                  </span>
                </div>
              </Link>

              {/* 右侧导航图标 */}
              <div className="flex items-center gap-3 sm:gap-5 lg:gap-8">
                {bottomNavItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="group flex flex-col items-center gap-0.5 transition-opacity hover:opacity-80 sm:gap-1"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl transition-colors group-hover:bg-brand-beige/50 sm:h-11 sm:w-11 lg:h-12 lg:w-12">
                        <Icon className="h-5 w-5 text-brand-gold sm:h-6 sm:w-6 lg:h-7 lg:w-7" />
                      </div>
                      <span className="hidden text-xs text-brand-charcoal/70 sm:block lg:text-sm">
                        {item.label}
                      </span>
                      <span className="hidden font-serif text-[10px] uppercase tracking-wide text-brand-charcoal/50 sm:block lg:text-xs">
                        {item.labelEn}
                      </span>
                    </Link>
                  );
                })}
                {/* 回到首页按钮 */}
                <Link
                  href="/"
                  className="group flex flex-col items-center gap-0.5 transition-opacity hover:opacity-80 sm:gap-1"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl transition-colors group-hover:bg-brand-beige/50 sm:h-11 sm:w-11 lg:h-12 lg:w-12">
                    <Home className="h-5 w-5 text-brand-gold sm:h-6 sm:w-6 lg:h-7 lg:w-7" />
                  </div>
                  <span className="hidden text-xs text-brand-charcoal/70 sm:block lg:text-sm">
                    首页
                  </span>
                  <span className="hidden font-serif text-[10px] uppercase tracking-wide text-brand-charcoal/50 sm:block lg:text-xs">
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

