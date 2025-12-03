"use client";

import { useEffect } from "react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * 错误边界页面
 */
export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // 记录错误到错误报告服务
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-brand-cream px-4">
      <div className="text-center">
        <h1 className="font-serif text-6xl text-brand-charcoal">出错了</h1>
        <p className="mt-4 text-brand-charcoal/60">抱歉，发生了一些意外错误。</p>
        <div className="mt-8 flex justify-center gap-4">
          <button
            onClick={() => reset()}
            className="rounded bg-brand-gold px-6 py-3 text-white transition hover:bg-brand-gold/90"
          >
            重试
          </button>
          <a
            href="/"
            className="rounded border border-brand-charcoal px-6 py-3 text-brand-charcoal transition hover:bg-brand-charcoal hover:text-white"
          >
            返回首页
          </a>
        </div>
      </div>
    </div>
  );
}
