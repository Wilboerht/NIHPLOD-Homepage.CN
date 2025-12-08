"use client";

import Link from "next/link";
import Image from "next/image";
import { m } from "framer-motion";
import { Sparkles, Package } from "lucide-react";
import type { HomePageContent } from "@/types/page-content";

/**
 * 网格背景色值 - 2行4列 布局
 */
const gridColors = [
  ["#F5F3EA", "#F9F5E7", "#EAE8DF", "#E9E5D5"], // 上面一行
  ["#E2E0D7", "#EBE8DB", "#E2E0D7", "#D8D5CA"], // 下面一行
];

// 默认内容
const defaultContent: HomePageContent = {
  brand: { chineseName: "旎柏", slogan: "逆转时光" },
  buttons: {
    advisorText: "AI 护肤顾问",
    advisorLink: "/advisor",
    productsText: "探索产品",
    productsLink: "/products",
  },
  copyright: "NIHPLOD All Rights Reserved.",
};

interface HomeClientProps {
  content?: HomePageContent;
}

/**
 * 首页客户端组件 - 网格色块背景布局
 */
export default function HomeClient({ content }: HomeClientProps) {
  // 合并默认内容和传入内容
  const brand = content?.brand || defaultContent.brand;
  const buttons = content?.buttons || defaultContent.buttons;
  const copyright = content?.copyright || defaultContent.copyright;

  return (
    <div className="fixed inset-0 flex flex-col">
      {/* 2行4列 网格色块背景 */}
      <div className="absolute inset-0 grid grid-cols-4 grid-rows-2">
        {gridColors.flat().map((color, index) => (
          <m.div
            key={index}
            className="h-full w-full"
            style={{ backgroundColor: color }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: index * 0.05 }}
          />
        ))}
      </div>

      {/* 主内容 - 居中 */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pt-8 sm:px-6 sm:pt-12 md:pt-16">
        {/* Logo */}
        <m.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <Image
            src="/images/logo.png"
            alt="NIHPLOD"
            width={320}
            height={100}
            className="h-12 w-auto sm:h-16 md:h-20 lg:h-24 xl:h-28"
            priority
          />
        </m.div>

        {/* 中文名 */}
        <m.p
          className="mt-2 font-serif text-xl text-brand-gold sm:mt-3 sm:text-2xl md:mt-4 md:text-3xl lg:text-4xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          {brand.chineseName}
        </m.p>

        {/* 品牌语 */}
        <m.p
          className="mt-3 text-xs tracking-[0.2em] text-brand-charcoal/60 sm:mt-4 sm:text-sm sm:tracking-[0.3em] md:mt-5 md:text-base lg:text-lg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {brand.slogan}
        </m.p>

        {/* 分隔线 */}
        <m.div
          className="my-6 h-px w-10 bg-brand-gold/40 sm:my-8 sm:w-12 md:my-10"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        />

        {/* 双入口 */}
        <m.div
          className="flex w-full max-w-xs flex-col gap-2.5 sm:max-w-sm sm:flex-row sm:gap-3 md:max-w-md md:gap-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          {/* AI 顾问 */}
          <Link href={buttons.advisorLink} className="group flex-1">
            <div className="flex items-center justify-center gap-2 rounded-full bg-brand-gold px-4 py-3 text-white shadow-lg transition-all hover:scale-105 hover:shadow-xl sm:gap-3 sm:px-5 sm:py-3.5 md:px-6 md:py-4">
              <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5" />
              <span className="text-xs font-medium sm:text-sm md:text-base">
                {buttons.advisorText}
              </span>
            </div>
          </Link>

          {/* 产品浏览 */}
          <Link href={buttons.productsLink} className="group flex-1">
            <div className="flex items-center justify-center gap-2 rounded-full border border-brand-charcoal/20 bg-white/90 px-4 py-3 text-brand-charcoal shadow-lg backdrop-blur-sm transition-all hover:scale-105 hover:border-brand-gold hover:text-brand-gold sm:gap-3 sm:px-5 sm:py-3.5 md:px-6 md:py-4">
              <Package className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5" />
              <span className="text-xs font-medium sm:text-sm md:text-base">
                {buttons.productsText}
              </span>
            </div>
          </Link>
        </m.div>

      </div>

      {/* 底部导航 */}
      <m.footer
        className="relative z-10 pb-4 pt-3 text-center sm:pb-6 sm:pt-4 md:pb-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.6 }}
      >
        <nav className="flex flex-wrap justify-center gap-3 text-[10px] text-brand-charcoal/50 sm:gap-4 sm:text-xs md:gap-6">
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
          <Link href="/privacy" className="transition-colors hover:text-brand-gold">
            隐私政策
          </Link>
          <Link href="/services" className="transition-colors hover:text-brand-gold">
            服务入口
          </Link>
        </nav>
        <p className="mt-3 text-[9px] text-brand-charcoal/25 sm:mt-4 sm:text-[10px]">
          © {new Date().getFullYear()} {copyright}
        </p>
      </m.footer>
    </div>
  );
}

