"use client";

import { useEffect } from "react";
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
        <div className="flex min-h-dvh flex-col items-center justify-center bg-[#fefcf8] px-6 py-16 font-sans text-brand-charcoal">
          {/* 内容区域 */}
          <div className="flex w-full max-w-md flex-col items-center text-center">
            {/* Logo - 使用原生 img 标签，避免 Global Error 时 next/image 依赖的应用壳不可用 */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="mb-10 inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/NIHPLOD-logo.svg"
                alt="NIHPLOD"
                width={143}
                height={40}
                className="h-[30px] w-[107px] object-contain sm:h-10 sm:w-[143px]"
              />
            </a>

            {/* 状态标识 */}
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-brand-charcoal/15 bg-white/60">
              <AlertTriangle className="h-6 w-6 text-brand-charcoal/45" strokeWidth={1.25} />
            </div>

            <p className="mb-3 text-[11px] font-light uppercase tracking-[0.35em] text-brand-charcoal/40">
              System Error
            </p>
            <h1 className="text-[24px] font-normal leading-[1.35] tracking-[0.06em] text-brand-charcoal sm:text-[28px]">
              系统遇到一点问题
            </h1>

            <div className="my-6 h-px w-12 bg-brand-charcoal/15" />

            <p className="text-[13px] font-light leading-[1.9] tracking-[0.02em] text-brand-charcoal/60 sm:text-sm">
              我们正在处理一次临时的系统故障。
              <br />
              请刷新页面重试，或稍后再访问。
            </p>

            {/* 错误详情（开发环境显示） */}
            {process.env.NODE_ENV === "development" && error.message && (
              <div className="mt-6 w-full rounded-lg border border-red-100 bg-red-50/70 p-4 text-left">
                <p className="text-xs font-medium text-red-600">Global Error</p>
                <p className="mt-1 break-words font-mono text-xs text-red-500">{error.message}</p>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="mt-10 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:gap-4">
              <button
                type="button"
                onClick={() => reset()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-brand-charcoal/15 bg-brand-ecru px-8 text-[13px] font-normal tracking-[0.12em] text-brand-charcoal shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_1px_2px_rgba(0,38,62,0.08)] transition-colors hover:bg-[#dcd0b2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/25 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fefcf8]"
              >
                <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
                重启应用
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-brand-charcoal/20 px-8 text-[13px] font-light tracking-[0.12em] text-brand-charcoal/70 transition-colors hover:border-brand-charcoal/40 hover:bg-brand-charcoal/[0.03] hover:text-brand-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/25 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fefcf8]"
              >
                <Home className="h-4 w-4" strokeWidth={1.5} />
                返回首页
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
