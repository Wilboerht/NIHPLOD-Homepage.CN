"use client";

import Link from "next/link";
import { m } from "framer-motion";
import { Sparkles, Package } from "lucide-react";

/**
 * 首页 - 全屏单页布局
 */
export default function Home() {
  return (
    <div className="fixed inset-0 bottom-16 overflow-hidden bg-brand-cream lg:bottom-20">
      {/* 背景渐变 */}
      <div className="absolute inset-0 bg-gradient-to-b from-brand-cream via-brand-cream to-brand-blush/30" />

      {/* 网格装饰线 */}
      <div className="pointer-events-none absolute inset-0">
        <m.div
          className="absolute left-0 right-0 top-1/3 h-px bg-gradient-to-r from-transparent via-brand-gold/20 to-transparent"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 1.2, delay: 0.5 }}
        />
        <m.div
          className="absolute bottom-1/3 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-gold/20 to-transparent"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 1.2, delay: 0.7 }}
        />
        <m.div
          className="absolute bottom-0 left-1/3 top-0 w-px bg-gradient-to-b from-transparent via-brand-gold/15 to-transparent"
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 1.2, delay: 0.9 }}
        />
        <m.div
          className="absolute bottom-0 right-1/3 top-0 w-px bg-gradient-to-b from-transparent via-brand-gold/15 to-transparent"
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 1.2, delay: 1.1 }}
        />
      </div>

      {/* 主内容 - 垂直居中 */}
      <div className="relative z-10 flex h-full flex-col items-center justify-center px-6">
        {/* 品牌标题 */}
        <m.h1
          className="font-serif text-4xl tracking-wider text-brand-charcoal md:text-5xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          NIHPLOD
        </m.h1>
        <m.p
          className="mt-1 font-serif text-brand-gold"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          旎柏
        </m.p>

        {/* 品牌口号 */}
        <m.p
          className="mt-3 text-xs uppercase tracking-[0.2em] text-brand-charcoal/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          源自摩纳哥的高端护肤品牌
        </m.p>

        {/* 分隔线 */}
        <m.div
          className="my-6 h-px w-12 bg-brand-gold/40"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        />

        {/* 双入口 */}
        <m.div
          className="grid w-full max-w-md gap-3 md:grid-cols-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          {/* AI 顾问入口 */}
          <Link href="/advisor" className="group">
            <div className="flex flex-col items-center rounded-xl bg-brand-gold px-5 py-4 text-white shadow-lg transition-all hover:-translate-y-1 hover:shadow-xl">
              <div className="mb-2 rounded-full bg-white/20 p-2">
                <Sparkles className="h-5 w-5" />
              </div>
              <span className="font-serif text-base">AI 护肤顾问</span>
              <span className="mt-0.5 text-xs text-white/70">
                获取专属护肤方案
              </span>
            </div>
          </Link>

          {/* 产品浏览入口 */}
          <Link href="/products" className="group">
            <div className="flex flex-col items-center rounded-xl border border-brand-beige bg-white/80 px-5 py-4 text-brand-charcoal transition-all hover:-translate-y-1 hover:shadow-lg">
              <div className="mb-2 rounded-full bg-brand-gold/10 p-2">
                <Package className="h-5 w-5 text-brand-gold" />
              </div>
              <span className="font-serif text-base">探索产品</span>
              <span className="mt-0.5 text-xs text-brand-charcoal/50">
                浏览全系列产品
              </span>
            </div>
          </Link>
        </m.div>

        {/* 底部装饰 */}
        <m.p
          className="mt-8 text-[10px] tracking-[0.3em] text-brand-charcoal/25 sm:text-xs"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          SKINCARE · BEAUTY · ELEGANCE
        </m.p>
      </div>
    </div>
  );
}
