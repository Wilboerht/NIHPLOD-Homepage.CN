"use client";

import { ReactNode, useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { m, useMotionValue, PanInfo } from "framer-motion";
import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 渐变背景配置（当图片加载失败时使用）
 */
const gradientBackgrounds: Record<string, string> = {
  "/images/products-hero.jpg": "from-brand-blush via-brand-cream to-brand-beige",
  "/images/ritual-bg.jpg": "from-brand-cream via-brand-blush to-brand-beige",
  "/images/contact-bg.jpg": "from-brand-beige via-brand-cream to-brand-blush",
  "/images/privacy-bg.jpg": "from-brand-cream via-brand-beige to-brand-blush",
  "/images/story-bg.jpg": "from-brand-blush via-brand-beige to-brand-cream",
  "/images/careers-bg.jpg": "from-brand-beige via-brand-blush to-brand-cream",
  default: "from-brand-cream via-brand-blush to-brand-beige",
};

/**
 * 卡片状态类型
 * minimized: 收起状态，只显示背景图片和底部拉手
 * expanded: 完全展开
 */
type CardState = "expanded" | "minimized";

/**
 * 状态高度配置
 * expanded: 内容区域占视口高度百分比
 * minimized: 只显示手柄（0高度，手柄用绝对定位在外面）
 */
const EXPANDED_HEIGHT_RATIO = 0.92;

interface FloatingCardLayoutProps {
  /** 背景图片 URL */
  backgroundImage: string;
  /** 背景图片 alt 文本 */
  backgroundAlt?: string;
  /** 卡片内容 */
  children: ReactNode;
  /** 初始状态 */
  initialState?: CardState;
  /** 是否启用拖拽 */
  enableDrag?: boolean;
  /** 是否显示拖动手柄 */
  showHandle?: boolean;
  /** 页面标题（用于手柄文字） */
  pageTitle?: string;
  /** 自定义类名 */
  className?: string;
}

/**
 * 悬浮卡片布局组件 - 从顶部向下拉展开
 * 功能：
 * - 背景图片层（固定定位）
 * - 内容区域从顶部向下展开
 * - 底部拉手（向上箭头）
 * - 三种状态：expanded/half/minimized
 * - 拖拽手势 + 释放后自动吸附
 */
export function FloatingCardLayout({
  backgroundImage,
  backgroundAlt = "背景图片",
  children,
  initialState = "minimized",
  enableDrag = true,
  showHandle = true,
  pageTitle = "查看详情",
  className,
}: FloatingCardLayoutProps) {
  const [cardState, setCardState] = useState<CardState>(initialState);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [isMounted, setIsMounted] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [imageError, setImageError] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // 获取渐变背景类名
  const gradientClass = gradientBackgrounds[backgroundImage] || gradientBackgrounds.default;

  // 拖拽相关
  const y = useMotionValue(0);
  const dragStartState = useRef<CardState>(initialState);

  // 客户端挂载检测
  useEffect(() => {
    setIsMounted(true);
    // 减去底部导航栏高度
    const navHeight = window.innerWidth >= 1024 ? 80 : 64;
    setViewportHeight(window.innerHeight - navHeight);

    // 检测是否偏好减少动画
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // 监听视口大小变化
  useEffect(() => {
    const handleResize = () => {
      const navHeight = window.innerWidth >= 1024 ? 80 : 64;
      setViewportHeight(window.innerHeight - navHeight);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 计算内容区域高度
  const getContentHeight = useCallback(
    (state: CardState) => {
      if (state === "minimized") {
        return 0; // 收起时内容区域高度为0
      }
      return viewportHeight * EXPANDED_HEIGHT_RATIO;
    },
    [viewportHeight]
  );

  /**
   * 根据拖拽距离和方向确定目标状态
   * 向下拖动 = 展开内容
   * 向上拖动 = 收起内容
   */
  const getTargetState = useCallback(
    (deltaY: number, velocity: number): CardState => {
      const threshold = viewportHeight * 0.1;
      const velocityThreshold = 500;

      // 快速滑动或超过阈值
      if (velocity > velocityThreshold || deltaY > threshold) {
        return "expanded";
      }
      if (velocity < -velocityThreshold || deltaY < -threshold) {
        return "minimized";
      }

      return dragStartState.current;
    },
    [viewportHeight]
  );

  /**
   * 拖拽开始
   */
  const handleDragStart = () => {
    dragStartState.current = cardState;
  };

  /**
   * 拖拽结束，吸附到最近的状态
   */
  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const deltaY = info.offset.y;
    const velocity = info.velocity.y;
    const targetState = getTargetState(deltaY, velocity);
    setCardState(targetState);
    y.set(0); // 重置拖拽偏移
  };

  /**
   * 点击拉手切换状态
   */
  const handleHandleClick = () => {
    setCardState(cardState === "minimized" ? "expanded" : "minimized");
  };

  // 服务端渲染时显示占位
  if (!isMounted) {
    return (
      <div className={cn("fixed inset-0 bottom-16 lg:bottom-20", className)}>
        <div className="absolute inset-0 bg-brand-beige" />
      </div>
    );
  }

  const currentContentHeight = getContentHeight(cardState);

  return (
    <div className={cn("fixed inset-0 bottom-16 overflow-hidden lg:bottom-20", className)}>
      {/* 背景层 - 图片或渐变 */}
      <div className="absolute inset-0 z-0">
        {imageError ? (
          // 图片加载失败时显示渐变背景
          <div className={cn("h-full w-full bg-gradient-to-br", gradientClass)} />
        ) : (
          <Image
            src={backgroundImage}
            alt={backgroundAlt}
            fill
            priority
            className="object-cover"
            sizes="100vw"
            onError={() => setImageError(true)}
          />
        )}
        {/* 顶部渐变遮罩 */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-transparent" />
      </div>

      {/* 内容区域 - 从顶部向下展开 */}
      <m.div
        className="absolute inset-x-0 top-0 z-10 touch-none"
        style={{ y: enableDrag ? y : 0 }}
        animate={{ height: currentContentHeight }}
        transition={
          prefersReducedMotion
            ? { duration: 0 }
            : { type: "spring", stiffness: 300, damping: 30 }
        }
        drag={enableDrag ? "y" : false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.3}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* 内容主体（展开时显示） */}
        {cardState === "expanded" && (
          <div className="relative flex h-full flex-col items-center">
            <div
              ref={contentRef}
              className="w-[90%] flex-1 overflow-y-auto overscroll-contain rounded-b-3xl bg-white/95 px-4 py-4 shadow-2xl backdrop-blur-sm"
            >
              {children}
            </div>
          </div>
        )}

        {/* 底部拖动手柄 - 始终显示 */}
        {showHandle && (
          <div className={cn(
            "absolute left-1/2 -translate-x-1/2",
            cardState === "expanded" ? "-bottom-8" : "top-4"
          )}>
            <button
              type="button"
              className="flex cursor-grab flex-col items-center justify-center gap-1 rounded-2xl bg-white px-8 py-3 shadow-lg transition-all hover:shadow-xl active:cursor-grabbing"
              onClick={handleHandleClick}
              aria-label="切换内容展开状态"
            >
              <span className="text-sm font-medium text-brand-charcoal/70">
                {cardState === "expanded" ? "收起" : pageTitle}
              </span>
              <m.div
                animate={{ rotate: cardState === "expanded" ? 0 : 180 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronUp className="h-6 w-6 text-brand-gold" />
              </m.div>
            </button>
          </div>
        )}
      </m.div>
    </div>
  );
}
