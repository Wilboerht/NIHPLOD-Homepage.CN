"use client";

import Link from "next/link";
import Image from "next/image";
import { m } from "framer-motion";
import { Sparkles, Package, ChevronRight } from "lucide-react";

/**
 * 首页 - 全屏沉浸式布局（无导航栏）
 * 响应式断点：
 * - xs: < 375px (超小屏手机)
 * - sm: 375-639px (手机)
 * - md: 640-767px (大手机/小平板)
 * - lg: 768-1023px (平板)
 * - xl: 1024-1279px (小桌面)
 * - 2xl: >= 1280px (大桌面)
 */
export default function Home() {
  return (
    <div className="fixed inset-0 overflow-y-auto overflow-x-hidden bg-brand-cream">
      {/* 背景渐变 */}
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-brand-cream via-brand-cream to-brand-blush/30" />

      {/* 装饰性元素 - 大屏幕显示更多 */}
      <div className="pointer-events-none fixed inset-0 hidden sm:block">
        {/* 水平装饰线 */}
        <m.div
          className="absolute left-0 right-0 top-1/4 h-px bg-gradient-to-r from-transparent via-brand-gold/20 to-transparent"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 1.2, delay: 0.5 }}
        />
        <m.div
          className="absolute bottom-1/4 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-gold/20 to-transparent"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 1.2, delay: 0.7 }}
        />
        {/* 垂直装饰线 - 仅在大屏幕显示 */}
        <m.div
          className="absolute bottom-0 left-1/4 top-0 hidden w-px bg-gradient-to-b from-transparent via-brand-gold/15 to-transparent lg:block"
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 1.2, delay: 0.9 }}
        />
        <m.div
          className="absolute bottom-0 right-1/4 top-0 hidden w-px bg-gradient-to-b from-transparent via-brand-gold/15 to-transparent lg:block"
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 1.2, delay: 1.1 }}
        />
      </div>

      {/* 主内容容器 - 确保最小高度并居中 */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-8 sm:px-6 sm:py-12 lg:py-16">
        {/* Logo 图片 - 响应式尺寸 */}
        <m.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          className="mb-3 sm:mb-4"
        >
          <Image
            src="/images/logo.png"
            alt="NIHPLOD"
            width={200}
            height={67}
            className="h-10 w-auto sm:h-12 md:h-14 lg:h-16 xl:h-20"
            priority
          />
        </m.div>

        {/* 中文品牌名 */}
        <m.p
          className="font-serif text-base text-brand-gold sm:text-lg md:text-xl lg:text-2xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          旎柏
        </m.p>

        {/* 品牌口号 */}
        <m.p
          className="mt-3 text-center text-[10px] uppercase tracking-[0.15em] text-brand-charcoal/50 sm:mt-4 sm:text-xs sm:tracking-[0.2em] md:text-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          源自摩纳哥的高端护肤品牌
        </m.p>

        {/* 分隔线 */}
        <m.div
          className="my-5 h-px w-12 bg-brand-gold/40 sm:my-6 sm:w-14 md:my-8 md:w-16"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        />

        {/* 双入口按钮 - 响应式布局 */}
        <m.div
          className="grid w-full max-w-xs gap-3 sm:max-w-sm sm:gap-4 md:max-w-md lg:max-w-xl lg:grid-cols-2 lg:gap-5 xl:max-w-2xl xl:gap-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          {/* AI 顾问入口 - 主要 CTA */}
          <Link href="/advisor" className="group">
            <div className="flex flex-col items-center rounded-xl bg-brand-gold px-4 py-4 text-white shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl sm:rounded-2xl sm:px-5 sm:py-5 lg:px-6 lg:py-6">
              <div className="mb-2 rounded-full bg-white/20 p-2 sm:mb-3 sm:p-3">
                <Sparkles className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <span className="font-serif text-base sm:text-lg lg:text-xl">
                AI 护肤顾问
              </span>
              <span className="mt-1 text-xs text-white/80 sm:text-sm">
                获取专属护肤方案
              </span>
              <ChevronRight className="mt-1.5 h-4 w-4 opacity-50 transition-transform group-hover:translate-x-1 sm:mt-2 sm:h-5 sm:w-5" />
            </div>
          </Link>

          {/* 产品浏览入口 */}
          <Link href="/products" className="group">
            <div className="flex flex-col items-center rounded-xl border-2 border-brand-beige bg-white/80 px-4 py-4 text-brand-charcoal backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-brand-gold/30 hover:shadow-lg sm:rounded-2xl sm:px-5 sm:py-5 lg:px-6 lg:py-6">
              <div className="mb-2 rounded-full bg-brand-gold/10 p-2 sm:mb-3 sm:p-3">
                <Package className="h-5 w-5 text-brand-gold sm:h-6 sm:w-6" />
              </div>
              <span className="font-serif text-base sm:text-lg lg:text-xl">
                探索产品
              </span>
              <span className="mt-1 text-xs text-brand-charcoal/60 sm:text-sm">
                浏览全系列产品
              </span>
              <ChevronRight className="mt-1.5 h-4 w-4 text-brand-gold opacity-50 transition-transform group-hover:translate-x-1 sm:mt-2 sm:h-5 sm:w-5" />
            </div>
          </Link>
        </m.div>

        {/* 底部装饰文字 */}
        <m.p
          className="mt-8 text-[9px] tracking-[0.2em] text-brand-charcoal/25 sm:mt-10 sm:text-[10px] sm:tracking-[0.3em] md:mt-12 md:text-xs"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.7 }}
        >
          SKINCARE · BEAUTY · ELEGANCE
        </m.p>

        {/* 快捷导航链接 */}
        <m.nav
          className="mt-4 flex flex-wrap justify-center gap-3 text-[11px] text-brand-charcoal/40 sm:mt-5 sm:gap-4 sm:text-xs md:mt-6 md:gap-5 lg:gap-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.8 }}
        >
          <Link
            href="/story"
            className="transition-colors hover:text-brand-gold"
          >
            品牌故事
          </Link>
          <Link
            href="/ritual"
            className="transition-colors hover:text-brand-gold"
          >
            护肤仪式
          </Link>
          <Link
            href="/contact"
            className="transition-colors hover:text-brand-gold"
          >
            联系我们
          </Link>
          <Link
            href="/careers"
            className="transition-colors hover:text-brand-gold"
          >
            加入我们
          </Link>
        </m.nav>

        {/* 底部版权 - 移到内容流中 */}
        <m.footer
          className="mt-6 text-center text-[9px] text-brand-charcoal/30 sm:mt-8 sm:text-[10px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1 }}
        >
          © {new Date().getFullYear()} NIHPLOD. All rights reserved.
        </m.footer>
      </div>
    </div>
  );
}

