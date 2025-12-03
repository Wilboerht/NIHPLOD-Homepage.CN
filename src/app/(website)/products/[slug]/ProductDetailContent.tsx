"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { m } from "framer-motion";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { ProductCard } from "@/components/website";
import { fadeInUp, defaultTransition } from "@/lib/animations";
import { cn } from "@/lib/utils";

interface ProductImage {
  id: string;
  url: string;
  alt: string | null;
}

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
  category: Category;
  images: ProductImage[];
  ingredients: string | null;
  usage: string | null;
  benefits: string[];
}

interface RelatedProduct {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
  price: number;
  capacity: string | null;
  category: { name: string };
  images: { url: string; alt: string | null }[];
}

interface ProductDetailContentProps {
  product: Product;
  relatedProducts: RelatedProduct[];
}

type TabType = "description" | "ingredients" | "usage";

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
 * 产品详情页内容组件
 */
export function ProductDetailContent({
  product,
  relatedProducts,
}: ProductDetailContentProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<TabType>("description");

  const currentImage = product.images[currentImageIndex];

  const tabs: { key: TabType; label: string }[] = [
    { key: "description", label: "产品描述" },
    { key: "ingredients", label: "成分说明" },
    { key: "usage", label: "使用方法" },
  ];

  const tabContent: Record<TabType, string | null> = {
    description: product.description,
    ingredients: product.ingredients,
    usage: product.usage,
  };

  return (
    <div className="min-h-screen bg-white pb-20">
      {/* 返回按钮 */}
      <div className="fixed left-4 top-4 z-40">
        <Link
          href="/products"
          className="flex items-center gap-1 rounded-full bg-white/90 px-3 py-2 text-sm shadow-md backdrop-blur-sm transition-colors hover:bg-brand-beige"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>返回</span>
        </Link>
      </div>

      {/* 图片轮播区域 */}
      <m.div
        className="relative aspect-square bg-brand-beige/30 md:aspect-[4/3] lg:aspect-[16/9]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        {/* 主图 */}
        {currentImage && (
          <Image
            src={currentImage.url}
            alt={currentImage.alt || product.name}
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
        )}

        {/* 缩略图列表 */}
        {product.images.length > 1 && (
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
            {product.images.map((img, index) => (
              <button
                key={img.id}
                type="button"
                onClick={() => setCurrentImageIndex(index)}
                className={cn(
                  "h-12 w-12 overflow-hidden rounded-lg border-2 transition-all",
                  currentImageIndex === index
                    ? "border-brand-gold shadow-md"
                    : "border-white/50 opacity-70 hover:opacity-100"
                )}
              >
                <Image
                  src={img.url}
                  alt={img.alt || `${product.name} - ${index + 1}`}
                  width={48}
                  height={48}
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </m.div>

      {/* 产品信息 */}
      <m.div
        className="mx-auto max-w-2xl px-6 py-8"
        variants={fadeInUp}
        initial="initial"
        animate="animate"
        transition={defaultTransition}
      >
        {/* 分类标签 */}
        <span className="inline-block rounded-full bg-brand-gold/10 px-3 py-1 text-xs font-medium text-brand-gold">
          {product.category.name}
        </span>

        {/* 产品名称 */}
        <div className="mt-4">
          <p className="text-xs uppercase tracking-widest text-brand-gold">
            {product.nameEn}
          </p>
          <h1 className="mt-1 font-serif text-3xl text-brand-charcoal">
            {product.name}
          </h1>
          {product.capacity && (
            <p className="mt-1 text-sm text-brand-charcoal/60">
              {product.capacity}
            </p>
          )}
        </div>

        {/* 价格 */}
        <p className="mt-4 text-2xl font-medium text-brand-charcoal">
          {formatPrice(product.price)}
        </p>

        {/* 功效标签 */}
        {product.benefits.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
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

        {/* Tab 切换 */}
        <div className="mt-8 border-b border-brand-beige">
          <div className="flex gap-6">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "relative pb-3 text-sm transition-colors",
                  activeTab === tab.key
                    ? "text-brand-charcoal"
                    : "text-brand-charcoal/50 hover:text-brand-charcoal/80"
                )}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <m.div
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-gold"
                    layoutId="tab-indicator"
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab 内容 */}
        <div className="mt-6">
          {tabContent[activeTab] ? (
            <p className="whitespace-pre-line text-sm leading-relaxed text-brand-charcoal/70">
              {tabContent[activeTab]}
            </p>
          ) : (
            <p className="text-sm text-brand-charcoal/40">暂无内容</p>
          )}
        </div>
      </m.div>

      {/* 相关产品推荐 */}
      {relatedProducts.length > 0 && (
        <div className="mt-8 border-t border-brand-beige pt-8">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="mb-6 text-center font-serif text-xl text-brand-charcoal">
              相关推荐
            </h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {relatedProducts.map((rp) => (
                <Link key={rp.id} href={`/products/${rp.slug}`}>
                  <ProductCard
                    product={{
                      id: rp.id,
                      name: rp.name,
                      nameEn: rp.nameEn,
                      slug: rp.slug,
                      price: rp.price,
                      capacity: rp.capacity || undefined,
                      images: rp.images.map((img) => ({
                        url: img.url,
                        alt: img.alt || undefined,
                      })),
                      category: { name: rp.category.name },
                    }}
                  />
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

