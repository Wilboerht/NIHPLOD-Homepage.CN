"use client";

import { useEffect, useCallback } from "react";
import Image from "next/image";
import { m, AnimatePresence } from "framer-motion";
import { X, ExternalLink } from "lucide-react";
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
 * 产品详情抽屉组件
 * 功能：
 * - 从右侧滑入动画
 * - 遮罩层点击关闭
 * - ESC 键关闭
 * - 锁定背景滚动
 * - 产品信息展示
 */
export function ProductDrawer({ isOpen, onClose, product }: ProductDrawerProps) {
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

  return (
    <AnimatePresence>
      {isOpen && product && (
        <>
          {/* 遮罩层 */}
          <m.div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* 抽屉内容 - 移动端从底部滑入，桌面端从右侧 */}
          <m.div
            className={cn(
              "fixed z-50 bg-white shadow-2xl",
              // 移动端：底部抽屉
              "inset-x-0 bottom-0 top-auto max-h-[90vh] rounded-t-2xl",
              // 桌面端：右侧抽屉
              "md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-full md:max-w-lg md:rounded-none"
            )}
            initial={{ y: "100%", x: 0 }}
            animate={{ y: 0, x: 0 }}
            exit={{ y: "100%", x: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
          >
            {/* 移动端拖动手柄 */}
            <div className="flex justify-center py-2 md:hidden">
              <div className="h-1 w-10 rounded-full bg-brand-beige" />
            </div>

            {/* 关闭按钮 */}
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 shadow-md transition-colors hover:bg-brand-beige md:top-4"
              aria-label="关闭"
            >
              <X className="h-5 w-5 text-brand-charcoal" />
            </button>

            {/* 可滚动内容区 */}
            <div className="max-h-[calc(90vh-2rem)] overflow-y-auto md:h-full md:max-h-none">
              {/* 产品主图 - 移动端使用更小的比例 */}
              <div className="relative aspect-[4/3] bg-brand-beige/30 md:aspect-square">
                {product.images[0] && (
                  <Image
                    src={product.images[0].url}
                    alt={product.images[0].alt || product.name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 512px) 100vw, 512px"
                  />
                )}
              </div>

              {/* 产品信息 */}
              <div className="p-6 space-y-4">
                {/* 分类 */}
                <span className="inline-block rounded-full bg-brand-gold/10 px-3 py-1 text-xs font-medium text-brand-gold">
                  {product.category.name}
                </span>

                {/* 标题 */}
                <div>
                  <p className="text-xs uppercase tracking-wider text-brand-gold">
                    {product.nameEn}
                  </p>
                  <h2 className="mt-1 font-serif text-2xl text-brand-charcoal">
                    {product.name}
                  </h2>
                  {product.capacity && (
                    <p className="mt-1 text-sm text-brand-charcoal/60">
                      {product.capacity}
                    </p>
                  )}
                </div>

                {/* 价格 */}
                <p className="text-xl font-medium text-brand-charcoal">
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
                  <h3 className="font-medium text-brand-charcoal">产品描述</h3>
                  <p className="text-sm leading-relaxed text-brand-charcoal/70">
                    {product.description}
                  </p>
                </div>

                {/* 成分 */}
                {product.ingredients && (
                  <div className="space-y-2">
                    <h3 className="font-medium text-brand-charcoal">主要成分</h3>
                    <p className="text-sm leading-relaxed text-brand-charcoal/70">
                      {product.ingredients}
                    </p>
                  </div>
                )}

                {/* 使用方法 */}
                {product.usage && (
                  <div className="space-y-2">
                    <h3 className="font-medium text-brand-charcoal">使用方法</h3>
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
                    className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-gold py-3 font-medium text-white transition-colors hover:bg-brand-gold/90"
                  >
                    <span>立即购买</span>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>
          </m.div>
        </>
      )}
    </AnimatePresence>
  );
}

export type { ProductData, ProductDrawerProps };

