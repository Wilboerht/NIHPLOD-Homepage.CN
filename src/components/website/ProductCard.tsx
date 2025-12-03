"use client";

import Image from "next/image";

interface ProductCardProps {
  title: string;
  image?: string;
  category?: string;
}

/**
 * 作品卡片组件
 * TODO: 实现完整功能
 */
export function ProductCard({ title, image, category }: ProductCardProps) {
  return (
    <div className="group cursor-pointer overflow-hidden rounded-lg bg-white shadow">
      <div className="relative aspect-[4/5] bg-brand-beige">
        {image ? (
          <Image
            src={image}
            alt={title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-brand-charcoal/30">
            暂无图片
          </div>
        )}
      </div>
      <div className="p-4">
        {category && <span className="text-xs text-brand-gold">{category}</span>}
        <h3 className="mt-1 font-serif text-lg text-brand-charcoal">{title}</h3>
      </div>
    </div>
  );
}
