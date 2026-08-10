"use client";

import { useEffect } from "react";
import Image from "next/image";
import { RefreshCw, Home, AlertTriangle } from "lucide-react";
import { logger } from "@/lib/logger";
import "./globals.css";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * 全局错误边界 (Catch-all)
 * 用于捕获根布局(RootLayout)级别的严重错误
 * 必须包含 html 和 body 标签，因为它会替换根布局
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // 可以在这里上报错误到 Sentry 等日志服务
    logger.error("Global critical error", {
      error,
      digest: error.digest,
      component: "GlobalError",
    });
  }, [error]);

  return (
    <html lang="zh-CN">
      <body>
        <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-brand-cream px-4 font-sans text-brand-charcoal">
          {/* 装饰背景 (硬编码颜色以确保不依赖外部 CSS) */}
          <div className="pointer-events-none absolute inset-0 opacity-5">
            <div className="absolute -left-20 -top-20 h-80 w-80 rounded-full bg-red-500 blur-3xl" />
            <div className="absolute -bottom-20 -right-20 h-80 w-80 rounded-full bg-brand-gold blur-3xl" />
          </div>

          {/* 内容区域 */}
          <div className="relative z-10 text-center">
            {/* Logo - 使用 img 标签因为 Next Image 可能加载失败 */}
            <div className="mb-8">
              {/* global-error 处于应用壳层之外，Next.js 官方要求使用原生 HTML 标签，不可用 next/link */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/" className="inline-block">
                <div className="relative h-[26px] w-[124px] sm:h-8 sm:w-[160px]">
                  <Image
                    src="/images/NIHPLOD-logo.svg"
                    alt="NIHPLOD"
                    fill
                    className="mx-auto object-contain"
                    priority
                    unoptimized
                  />
                </div>
              </a>
            </div>

            {/* 错误图标 */}
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-50">
              <AlertTriangle className="h-10 w-10 text-red-400" />
            </div>

            {/* 文字说明 */}
            <h1 className="font-serif text-3xl font-medium md:text-4xl">系统遇到一点问题</h1>
            <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-brand-charcoal/60">
              我们正在经历一次严重的系统故障。
              <br />
              请尝试刷新页面重置系统。
            </p>

            {/* 错误详情（开发环境显示） */}
            {process.env.NODE_ENV === "development" && error.message && (
              <div className="mx-auto mt-4 max-w-lg rounded-lg border border-red-100 bg-red-50 p-4 text-left">
                <p className="text-xs font-medium text-red-600">Global Error:</p>
                <p className="mt-1 font-mono text-xs text-red-500">{error.message}</p>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <button
                onClick={() => reset()}
                className="flex items-center gap-2 rounded-full bg-brand-gold px-8 py-3 text-sm font-medium text-white shadow-md transition-all hover:bg-brand-gold-dark hover:shadow-lg"
              >
                <RefreshCw className="h-4 w-4" />
                重启应用
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                className="flex items-center gap-2 rounded-full border border-brand-charcoal/20 px-8 py-3 text-sm font-medium text-brand-charcoal/60 transition-all hover:border-brand-gold hover:bg-brand-cream hover:text-brand-gold"
              >
                <Home className="h-4 w-4" />
                返回首页
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
