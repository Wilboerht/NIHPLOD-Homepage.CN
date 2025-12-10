"use client";

import { useEffect, useCallback, useState } from "react";
import Image from "next/image";
import { m, AnimatePresence } from "framer-motion";
import { X, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 产品数据类型
 */
interface ProductData {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
  description: string;
  price: number;
  capacity?: string;
  purchaseUrl?: string;
  images: { url: string; alt?: string }[];
  category: { name: string };
  ingredients?: string;
  usage?: string;
  benefits: string[];
}

interface ProductDrawerProps {
  /** 是否打开 */
  isOpen: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 产品数据 */
  product: ProductData | null;
}

/**
 * 格式化价格
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
 * 产品详情模态框组件
 * 功能：
 * - 居中弹出动画
 * - 遮罩层点击关闭
 * - ESC 键关闭
 * - 锁定背景滚动
 * - 产品信息展示
 */
export function ProductDrawer({ isOpen, onClose, product }: ProductDrawerProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // ESC 键关闭
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  // 锁定背景滚动
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      document.addEventListener("keydown", handleKeyDown);
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  // 重置图片索引
  useEffect(() => {
    if (!isOpen) {
      setCurrentImageIndex(0);
    }
  }, [isOpen]);

  // 切换图片
  const handlePrevImage = () => {
    if (product && product.images.length > 1) {
      setCurrentImageIndex((prev) =>
        prev === 0 ? product.images.length - 1 : prev - 1
      );
    }
  };

  const handleNextImage = () => {
    if (product && product.images.length > 1) {
      setCurrentImageIndex((prev) =>
        prev === product.images.length - 1 ? 0 : prev + 1
      );
    }
  };

  return (
    <AnimatePresence>
      {isOpen && product && (
        <>
          {/* 遮罩层 */}
          <m.div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* 居中模态框容器 */}
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 pointer-events-none">
            {/* 主模态框 */}
            <m.div
              className={cn(
                "relative w-full max-w-3xl bg-white shadow-2xl rounded-2xl overflow-hidden pointer-events-auto",
                "max-h-[75vh] flex flex-col",
                "lg:max-w-4xl xl:max-w-5xl lg:flex-row lg:max-h-[70vh]"
              )}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              {/* 关闭按钮 */}
              <button
                type="button"
                onClick={onClose}
                className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-white/20 text-brand-charcoal/70 backdrop-blur-md transition-all hover:bg-white/40 hover:text-brand-charcoal lg:right-4 lg:top-4 lg:h-10 lg:w-10"
                aria-label="关闭"
              >
                <X className="h-4 w-4 lg:h-5 lg:w-5" />
              </button>

              {/* 产品图片区域 */}
              <div className="relative aspect-square flex-shrink-0 bg-brand-beige/20 lg:aspect-auto lg:w-1/2">
                {/* 主图 */}
                <AnimatePresence mode="wait">
                  {product.images[currentImageIndex] && (
                    <m.div
                      key={currentImageIndex}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="absolute inset-0"
                    >
                      <Image
                        src={product.images[currentImageIndex].url}
                        alt={product.images[currentImageIndex].alt || product.name}
                        fill
                        className="object-cover"
                        sizes="(max-width: 1024px) 100vw, 50vw"
                      />
                    </m.div>
                  )}
                </AnimatePresence>

                {/* 左右切换按钮 */}
                {product.images.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={handlePrevImage}
                      className="absolute left-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-brand-charcoal/50 transition-all hover:text-brand-charcoal lg:left-3 lg:h-9 lg:w-9 lg:rounded-full lg:border lg:border-brand-gold/20 lg:bg-white/90 lg:text-brand-charcoal/70 lg:backdrop-blur-sm lg:hover:border-brand-gold/40 lg:hover:bg-white"
                      aria-label="上一张"
                    >
                      <ChevronLeft className="h-5 w-5 lg:h-5 lg:w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleNextImage}
                      className="absolute right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-brand-charcoal/50 transition-all hover:text-brand-charcoal lg:right-3 lg:h-9 lg:w-9 lg:rounded-full lg:border lg:border-brand-gold/20 lg:bg-white/90 lg:text-brand-charcoal/70 lg:backdrop-blur-sm lg:hover:border-brand-gold/40 lg:hover:bg-white"
                      aria-label="下一张"
                    >
                      <ChevronRight className="h-5 w-5 lg:h-5 lg:w-5" />
                    </button>
                  </>
                )}
              </div>

              {/* 产品信息 - 可滚动区域 */}
              <div className="flex-1 overflow-y-auto lg:w-1/2">
                <div className="space-y-4 p-5 lg:p-6">
                  {/* 分类 */}
                  <span className="inline-block rounded-full bg-brand-gold/10 px-3 py-1 text-xs font-medium text-brand-gold">
                    {product.category.name}
                  </span>

                  {/* 标题 */}
                  <div>
                    <p className="text-xs uppercase tracking-wider text-brand-gold">
                      {product.nameEn}
                    </p>
                    <h2 className="mt-1 font-serif text-xl text-brand-charcoal lg:text-2xl">
                      {product.name}
                    </h2>
                    {product.capacity && (
                      <p className="mt-1 text-sm text-brand-charcoal/60">
                        {product.capacity}
                      </p>
                    )}
                  </div>

                  {/* 价格 */}
                  <p className="text-lg font-medium text-brand-charcoal lg:text-xl">
                    {formatPrice(product.price)}
                  </p>

                  {/* 功效标签 */}
                  {product.benefits.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {product.benefits.map((benefit, index) => (
                        <span
                          key={index}
                          className="rounded-full border border-brand-beige bg-brand-cream px-3 py-1 text-xs text-brand-charcoal"
                        >
                          {benefit}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* 描述 */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-brand-charcoal">产品描述</h3>
                    <p className="text-sm leading-relaxed text-brand-charcoal/70">
                      {product.description}
                    </p>
                  </div>

                  {/* 成分 */}
                  {product.ingredients && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-brand-charcoal">主要成分</h3>
                      <p className="text-sm leading-relaxed text-brand-charcoal/70">
                        {product.ingredients}
                      </p>
                    </div>
                  )}

                  {/* 使用方法 */}
                  {product.usage && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-brand-charcoal">使用方法</h3>
                      <p className="text-sm leading-relaxed text-brand-charcoal/70">
                        {product.usage}
                      </p>
                    </div>
                  )}

                  {/* 购买按钮 */}
                  {product.purchaseUrl && (
                    <a
                      href={product.purchaseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-brand-gold/30 bg-brand-gold/10 py-3 text-sm font-medium text-brand-charcoal transition-all hover:border-brand-gold/50 hover:bg-brand-gold/20"
                    >
                      <span>立即购买</span>
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>
            </m.div>

            {/* 缩略图选择器 - 模态框外部 */}
            {product.images.length > 1 && (
              <m.div
                className="mt-4 flex gap-3 pointer-events-auto"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ type: "spring", damping: 25, stiffness: 300, delay: 0.1 }}
              >
                {product.images.map((img, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setCurrentImageIndex(index)}
                    className={cn(
                      "h-14 w-14 overflow-hidden rounded-xl border-2 transition-all lg:h-16 lg:w-16",
                      currentImageIndex === index
                        ? "border-brand-gold shadow-lg scale-110"
                        : "border-white/80 opacity-80 hover:opacity-100 hover:scale-105"
                    )}
                  >
                    <Image
                      src={img.url}
                      alt={img.alt || `${product.name} - ${index + 1}`}
                      width={64}
                      height={64}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </m.div>
            )}
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

export type { ProductData, ProductDrawerProps };

