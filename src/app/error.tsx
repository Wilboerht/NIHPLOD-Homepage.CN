"use client";

import { useEffect } from "react";
import Image from "next/image";
import { Link } from "next-view-transitions";
import { RefreshCw, Home, AlertTriangle } from "lucide-react";

import { logger } from "@/lib/logger";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * 错误边界页面 - 品牌风格设计
 */
export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // 记录错误到错误报告服务
    logger.error("Application error", {
      error,
      digest: error.digest,
      component: "ErrorPage"
    });
  }, [error]);

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-brand-cream px-4">
      {/* 装饰背景 */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute -left-20 -top-20 h-80 w-80 rounded-full bg-red-500 blur-3xl" />
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

        {/* 错误图标 */}
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-50">
          <AlertTriangle className="h-10 w-10 text-red-400" />
        </div>

        {/* 文字说明 */}
        <h1 className="font-serif text-3xl text-brand-charcoal md:text-4xl">
          出错了
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-brand-charcoal/60">
          抱歉，发生了一些意外错误。
          <br />
          请尝试刷新页面，或稍后再试。
        </p>

        {/* 错误详情（开发环境显示） */}
        {process.env.NODE_ENV === "development" && error.message && (
          <div className="mx-auto mt-4 max-w-lg rounded-lg bg-red-50 p-4 text-left">
            <p className="text-xs font-medium text-red-600">错误信息：</p>
            <p className="mt-1 text-xs text-red-500">{error.message}</p>
            {error.digest && (
              <p className="mt-2 text-xs text-red-400">
                错误 ID: {error.digest}
              </p>
            )}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <button
            onClick={() => reset()}
            className="flex items-center gap-2 rounded-full bg-brand-gold px-6 py-3 text-sm font-medium text-white shadow-md transition-all hover:bg-brand-gold/90 hover:shadow-lg"
          >
            <RefreshCw className="h-4 w-4" />
            重试
          </button>
          <Link
            href="/"
            className="flex items-center gap-2 rounded-full border border-brand-charcoal/20 px-6 py-3 text-sm font-medium text-brand-charcoal transition-all hover:border-brand-charcoal hover:bg-brand-charcoal hover:text-white"
          >
            <Home className="h-4 w-4" />
            返回首页
          </Link>
        </div>

        {/* 分隔线 */}
        <div className="mx-auto my-10 h-px w-20 bg-brand-beige" />

        {/* 联系支持 */}
        <div className="text-sm text-brand-charcoal/50">
          <p>
            如果问题持续存在，请
            <Link href="/contact" className="ml-1 text-brand-gold hover:underline">
              联系我们
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
