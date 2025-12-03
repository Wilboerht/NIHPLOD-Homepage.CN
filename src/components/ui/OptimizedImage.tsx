"use client";

import Image, { ImageProps } from "next/image";
import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";

// ============================================
// 优化的图片组件
// 封装 Next.js Image，提供统一的加载体验
// ============================================

interface OptimizedImageProps extends Omit<ImageProps, "onLoad" | "onError"> {
  /** 是否显示加载骨架屏 */
  showSkeleton?: boolean;
  /** 图片加载失败时的回退图片 */
  fallbackSrc?: string;
  /** 容器类名 */
  containerClassName?: string;
  /** 图片加载成功回调 */
  onLoadComplete?: () => void;
  /** 图片加载失败回调 */
  onLoadError?: () => void;
}

// 默认模糊占位符 (10x10 灰色渐变)
const DEFAULT_BLUR_DATA_URL =
  "data:image/webp;base64,UklGRlYAAABXRUJQVlA4IEoAAADQAQCdASoKAAoAAUAmJYgCdAEO/hOMAAD++O/K2P7L37y96Dv/ldZH/4f/h/93/X/6v7P3ADpXsn+2f7N/s3+yf/J/x39k/Wf/1vQA";

/**
 * 优化的图片组件
 * 
 * 特性：
 * - 自动使用模糊占位符
 * - 加载状态显示
 * - 错误回退处理
 * - 响应式 sizes 预设
 */
export function OptimizedImage({
  src,
  alt,
  fill,
  width,
  height,
  sizes,
  priority = false,
  placeholder = "blur",
  blurDataURL,
  className,
  containerClassName,
  showSkeleton = true,
  fallbackSrc = "/images/placeholder.webp",
  onLoadComplete,
  onLoadError,
  ...props
}: OptimizedImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // 图片加载完成
  const handleLoad = useCallback(() => {
    setIsLoading(false);
    onLoadComplete?.();
  }, [onLoadComplete]);

  // 图片加载失败
  const handleError = useCallback(() => {
    setIsLoading(false);
    setHasError(true);
    onLoadError?.();
  }, [onLoadError]);

  // 计算实际显示的图片源
  const imageSrc = hasError ? fallbackSrc : src;

  // 默认的 sizes 配置 (响应式)
  const defaultSizes = fill
    ? "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
    : undefined;

  return (
    <div className={cn("relative overflow-hidden", containerClassName)}>
      {/* 加载骨架屏 */}
      {showSkeleton && isLoading && (
        <div
          className={cn(
            "absolute inset-0 animate-pulse bg-gradient-to-r from-brand-beige/50 via-brand-cream to-brand-beige/50",
            "bg-[length:200%_100%]"
          )}
          style={{
            animation: "shimmer 1.5s ease-in-out infinite",
          }}
        />
      )}

      <Image
        src={imageSrc}
        alt={alt}
        fill={fill}
        width={!fill ? width : undefined}
        height={!fill ? height : undefined}
        sizes={sizes || defaultSizes}
        priority={priority}
        placeholder={blurDataURL || placeholder === "blur" ? "blur" : "empty"}
        blurDataURL={blurDataURL || DEFAULT_BLUR_DATA_URL}
        className={cn(
          "transition-opacity duration-300",
          isLoading ? "opacity-0" : "opacity-100",
          className
        )}
        onLoad={handleLoad}
        onError={handleError}
        {...props}
      />
    </div>
  );
}

// ============================================
// 预设的图片尺寸配置
// ============================================

/** 产品图片 sizes */
export const PRODUCT_IMAGE_SIZES = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw";

/** 全宽图片 sizes */
export const FULL_WIDTH_SIZES = "100vw";

/** 卡片图片 sizes */
export const CARD_IMAGE_SIZES = "(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw";

/** 缩略图 sizes */
export const THUMBNAIL_SIZES = "96px";

// ============================================
// 图片工具函数
// ============================================

/**
 * 获取响应式图片 URL
 * 支持添加宽度参数
 */
export function getResponsiveImageUrl(url: string, width: number): string {
  // 如果是外部 URL，直接返回
  if (url.startsWith("http")) {
    return url;
  }
  // Next.js 内置图片优化 API
  return `/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=80`;
}

/**
 * 预加载关键图片
 * 用于 LCP 优化
 */
export function preloadImage(src: string): void {
  if (typeof window === "undefined") return;

  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "image";
  link.href = src;
  document.head.appendChild(link);
}

/**
 * 检查图片是否在视口内
 */
export function isImageInViewport(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

// 骨架屏动画 keyframes (需要在全局 CSS 中定义)
// @keyframes shimmer {
//   0% { background-position: -200% 0; }
//   100% { background-position: 200% 0; }
// }

