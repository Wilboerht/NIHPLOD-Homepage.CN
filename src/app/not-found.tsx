"use client";

import { Link } from "next-view-transitions";
import Image from "next/image";
import { Home, ArrowLeft } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";

/**
 * 404 页面 - 品牌风格设计
 */
export default function NotFound() {
  const { openContact } = useAuth();

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-brand-cream px-4">
      {/* 装饰背景 */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute -left-20 -top-20 h-80 w-80 rounded-full bg-brand-gold blur-3xl" />
        <div className="absolute -bottom-20 -right-20 h-80 w-80 rounded-full bg-brand-gold blur-3xl" />
      </div>

      {/* 内容区域 */}
      <div className="relative z-10 text-center">
        {/* Logo */}
        <div className="mb-8">
          <Link href="/" className="inline-block">
            <div className="relative h-[26px] w-[124px] sm:h-8 sm:w-[160px]">
              <Image
                src="/images/NIHPLOD-logo.svg"
                alt="NIHPLOD"
                fill
                className="mx-auto object-contain"
                priority
              />
            </div>
          </Link>
        </div>

        {/* 404 数字 */}
        <div className="relative">
          <h1 className="font-serif text-[150px] font-light leading-none text-brand-gold/20 md:text-[200px]">
            404
          </h1>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-serif text-5xl text-brand-gold md:text-6xl">
              404
            </span>
          </div>
        </div>

        {/* 文字说明 */}
        <h2 className="mt-6 font-serif text-2xl text-brand-charcoal md:text-3xl">
          页面未找到
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-brand-charcoal/60">
          抱歉，您访问的页面不存在或已被移除。
          <br />
          请检查网址是否正确，或返回首页继续浏览。
        </p>

        {/* 操作按钮 */}
        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-full bg-brand-gold px-6 py-3 text-sm font-medium text-white shadow-md transition-all hover:bg-brand-gold/90 hover:shadow-lg"
          >
            <Home className="h-4 w-4" />
            返回首页
          </Link>
          <button
            onClick={() => typeof window !== "undefined" && window.history.back()}
            className="flex items-center gap-2 rounded-full border border-brand-charcoal/20 px-6 py-3 text-sm font-medium text-brand-charcoal transition-all hover:border-brand-charcoal hover:bg-brand-charcoal hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            返回上页
          </button>
        </div>

        {/* 分隔线 */}
        <div className="mx-auto my-10 h-px w-20 bg-brand-beige" />

        {/* 快捷链接 */}
        <div className="text-sm text-brand-charcoal/50">
          <p className="mb-3">您可能想访问：</p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/products" className="text-brand-gold hover:underline">
              产品系列
            </Link>
            <Link href="/about" className="text-brand-gold hover:underline">
              关于旎柏
            </Link>
            <Link href="/guide" className="text-brand-gold hover:underline">
              官方指南
            </Link>
            <button onClick={() => openContact()} className="text-brand-gold hover:underline">
              联系我们
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
