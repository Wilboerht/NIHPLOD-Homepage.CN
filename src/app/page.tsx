"use client";

import Link from "next/link";
import Image from "next/image";
import { m } from "framer-motion";
import { Sparkles, Package } from "lucide-react";
import CircularGallery from "@/components/ui/CircularGallery";

// 产品图片数据 - 使用高端护肤品风格的占位图
const galleryItems = [
  { image: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=800&h=600&fit=crop", text: "精华液" },
  { image: "https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?w=800&h=600&fit=crop", text: "面霜" },
  { image: "https://images.unsplash.com/photo-1611930022073-b7a4ba5fcccd?w=800&h=600&fit=crop", text: "眼霜" },
  { image: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&h=600&fit=crop", text: "洁面乳" },
  { image: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=800&h=600&fit=crop", text: "爽肤水" },
  { image: "https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=800&h=600&fit=crop", text: "面膜" },
];

/**
 * 首页 - 沉浸式圆形画廊布局
 * 双入口：AI 护肤顾问 + 产品浏览
 */
export default function Home() {
  return (
    <div className="fixed inset-0 flex flex-col bg-brand-cream">
      {/* 圆形画廊背景 */}
      <div className="absolute inset-0 opacity-60">
        <CircularGallery
          items={galleryItems}
          bend={3}
          textColor="#C9A86C"
          borderRadius={0.05}
          font="500 16px sans-serif"
          scrollSpeed={1.5}
          scrollEase={0.03}
        />
      </div>

      {/* 渐变遮罩 - 增强中心内容可读性 */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-cream/80 via-brand-cream/60 to-brand-cream/80" />

      {/* 主内容 - 垂直居中 */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6">
        {/* Logo */}
        <m.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <Image
            src="/images/logo.png"
            alt="NIHPLOD"
            width={240}
            height={80}
            className="h-14 w-auto sm:h-20 md:h-24 lg:h-28"
            priority
          />
        </m.div>

        {/* 中文名 */}
        <m.p
          className="mt-3 font-serif text-2xl text-brand-gold sm:mt-4 sm:text-3xl md:text-4xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          旎柏
        </m.p>

        {/* 品牌语 */}
        <m.p
          className="mt-4 text-sm tracking-[0.3em] text-brand-charcoal/60 sm:mt-5 sm:text-base md:text-lg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          逆转时光
        </m.p>

        {/* 分隔线 */}
        <m.div
          className="my-8 h-px w-12 bg-brand-gold/40 sm:my-10"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        />

        {/* 双入口 */}
        <m.div
          className="flex w-full max-w-sm flex-col gap-3 sm:max-w-md sm:flex-row sm:gap-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          {/* AI 顾问 */}
          <Link href="/advisor" className="group flex-1">
            <div className="flex items-center justify-center gap-3 rounded-full bg-brand-gold px-6 py-3.5 text-white shadow-lg transition-all hover:scale-105 hover:shadow-xl sm:py-4">
              <Sparkles className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="text-sm font-medium sm:text-base">
                AI 护肤顾问
              </span>
            </div>
          </Link>

          {/* 产品浏览 */}
          <Link href="/products" className="group flex-1">
            <div className="flex items-center justify-center gap-3 rounded-full border border-brand-charcoal/20 bg-white/90 px-6 py-3.5 text-brand-charcoal shadow-lg backdrop-blur-sm transition-all hover:scale-105 hover:border-brand-gold hover:text-brand-gold sm:py-4">
              <Package className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="text-sm font-medium sm:text-base">探索产品</span>
            </div>
          </Link>
        </m.div>

        {/* 滑动提示 */}
        <m.p
          className="mt-8 text-xs text-brand-charcoal/30"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.8 }}
        >
          ← 滑动探索 →
        </m.p>
      </div>

      {/* 底部导航 */}
      <m.footer
        className="relative z-10 pb-6 pt-4 text-center sm:pb-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.6 }}
      >
        <nav className="flex flex-wrap justify-center gap-4 text-xs text-brand-charcoal/50 sm:gap-6">
          <Link href="/story" className="transition-colors hover:text-brand-gold">
            品牌故事
          </Link>
          <Link href="/ritual" className="transition-colors hover:text-brand-gold">
            护肤仪式
          </Link>
          <Link href="/contact" className="transition-colors hover:text-brand-gold">
            联系我们
          </Link>
          <Link href="/careers" className="transition-colors hover:text-brand-gold">
            加入我们
          </Link>
        </nav>
        <p className="mt-4 text-[10px] text-brand-charcoal/25">
          © {new Date().getFullYear()} NIHPLOD
        </p>
      </m.footer>
    </div>
  );
}

