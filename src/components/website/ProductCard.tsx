"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { m, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { fadeIn, defaultTransition } from "@/lib/animations";

/**
 * 产品图片类型
 */
interface ProductImage {
  url: string;
  alt?: string;
}

/**
 * 产品分类类型
 */
interface ProductCategory {
  name: string;
}

/**
 * 产品数据类型
 */
interface Product {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
  price: number;
  capacity?: string;
  images: ProductImage[];
  category: ProductCategory;
}

/**
 * ProductCard 组件属性
 */
interface ProductCardProps {
  /** 产品数据 */
  product: Product;
  /** 点击回调（用于打开详情抽屉） */
  onClick?: () => void;
  /** 是否优先加载（LCP 优化） */
  priority?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * 格式化价格显示
 */
function formatPrice(price: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

/**
 * 骨架屏组件
 */
function ProductCardSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-xl bg-white shadow-sm">
      {/* 图片骨架 */}
      <div className="relative aspect-[4/5] bg-brand-beige/50" />
      {/* 内容骨架 */}
      <div className="p-4 space-y-3">
        <div className="h-3 w-16 rounded bg-brand-beige/50" />
        <div className="h-5 w-3/4 rounded bg-brand-beige/50" />
        <div className="h-4 w-1/2 rounded bg-brand-beige/50" />
        <div className="h-5 w-20 rounded bg-brand-beige/50" />
      </div>
    </div>
  );
}

/**
 * 产品卡片组件
 * 功能：
 * - 图片展示（主图 + hover 切换）
 * - 产品信息（名称、英文名、价格、容量、分类）
 * - 点击交互（触发 onClick 回调）
 * - 加载动画（骨架屏 + 淡入效果）
 * - 响应式适配
 */
export function ProductCard({
  product,
  onClick,
  priority = false,
  className,
}: ProductCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const { name, nameEn, price, capacity, images, category } = product;

  // 是否有多张图片
  const hasMultipleImages = images.length > 1;

  // 获取当前显示的图片
  const currentImage = images[currentImageIndex] || images[0];
  const hoverImage = hasMultipleImages ? images[1] : null;

  /**
   * 处理鼠标进入
   */
  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    if (hasMultipleImages) {
      setCurrentImageIndex(1);
    }
  }, [hasMultipleImages]);

  /**
   * 处理鼠标离开
   */
  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    setCurrentImageIndex(0);
  }, []);

  /**
   * 处理图片加载完成
   */
  const handleImageLoad = useCallback(() => {
    setIsImageLoaded(true);
  }, []);

  /**
   * 处理点击事件
   */
  const handleClick = useCallback(() => {
    onClick?.();
  }, [onClick]);

  /**
   * 处理键盘事件（无障碍）
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick?.();
      }
    },
    [onClick]
  );

  return (
    <m.article
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-xl bg-white shadow-sm",
        "transition-shadow duration-300 hover:shadow-lg",
        "focus-within:ring-2 focus-within:ring-brand-gold focus-within:ring-offset-2",
        className
      )}
      variants={fadeIn}
      initial="initial"
      animate="animate"
      transition={defaultTransition}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`查看${name}详情`}
    >
      {/* 图片区域 */}
      <div className="relative aspect-[4/5] overflow-hidden bg-brand-beige/30">
        {/* 骨架屏（图片加载前显示） */}
        {!isImageLoaded && (
          <div className="absolute inset-0 animate-pulse bg-brand-beige/50" />
        )}

        {/* 主图片 */}
        {images.length > 0 ? (
          <AnimatePresence mode="wait">
            <m.div
              key={currentImageIndex}
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Image
                src={currentImage.url}
                alt={currentImage.alt || name}
                fill
                priority={priority}
                className={cn(
                  "object-cover transition-transform duration-500",
                  "group-hover:scale-105"
                )}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                onLoad={handleImageLoad}
              />
            </m.div>
          </AnimatePresence>
        ) : (
          <div className="flex h-full items-center justify-center text-brand-charcoal/30">
            <span className="text-sm">暂无图片</span>
          </div>
        )}

        {/* 分类标签（悬停显示） */}
        <m.div
          className="absolute left-3 top-3"
          initial={{ opacity: 0, y: -10 }}
          animate={{
            opacity: isHovered ? 1 : 0,
            y: isHovered ? 0 : -10,
          }}
          transition={{ duration: 0.2 }}
        >
          <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-brand-charcoal backdrop-blur-sm">
            {category.name}
          </span>
        </m.div>

        {/* 图片指示器（多图时显示） */}
        {hasMultipleImages && (
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {images.slice(0, 3).map((_, index) => (
              <div
                key={index}
                className={cn(
                  "h-1.5 w-1.5 rounded-full transition-all duration-200",
                  index === currentImageIndex
                    ? "w-4 bg-white"
                    : "bg-white/50"
                )}
              />
            ))}
          </div>
        )}
      </div>

      {/* 产品信息 */}
      <div className="p-3 space-y-1 md:p-4">
        {/* 英文名 */}
        <p className="text-[11px] uppercase tracking-wider text-brand-gold md:text-xs">
          {nameEn}
        </p>

        {/* 中文名 */}
        <h3 className="font-serif text-base leading-tight text-brand-charcoal line-clamp-2 md:text-lg">
          {name}
        </h3>

        {/* 容量（如有） */}
        {capacity && (
          <p className="text-xs text-brand-charcoal/60">{capacity}</p>
        )}

        {/* 价格 */}
        <p className="pt-1 text-sm font-medium text-brand-charcoal md:text-base">
          {formatPrice(price)}
        </p>
      </div>

      {/* 悬停遮罩效果 */}
      <m.div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-brand-charcoal/10 to-transparent"
        initial={{ opacity: 0 }}
        animate={{ opacity: isHovered ? 1 : 0 }}
        transition={{ duration: 0.3 }}
      />
    </m.article>
  );
}

// 导出骨架屏组件供外部使用
ProductCard.Skeleton = ProductCardSkeleton;

// 导出类型供外部使用
export type { ProductCardProps, Product, ProductImage, ProductCategory };
