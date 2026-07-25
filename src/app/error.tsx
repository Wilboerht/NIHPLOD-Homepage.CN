"use client";

import { useEffect } from "react";
import { logger } from "@/lib/logger";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    logger.error("Application error", {
      error,
      digest: error.digest,
      component: "ErrorPage",
    });
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4">
      <h1 className="text-xl font-medium text-brand-charcoal">出现了一些问题</h1>
      <p className="text-sm text-brand-charcoal/60">抱歉，页面加载时发生了错误，请稍后再试。</p>
      {process.env.NODE_ENV === "development" && error.message && (
        <p className="max-w-md rounded-lg border border-brand-charcoal/10 bg-brand-charcoal/5 px-4 py-3 font-mono text-xs text-brand-charcoal/60">
          {error.message}
        </p>
      )}
      <button
        onClick={() => reset()}
        className="rounded-full bg-brand-charcoal px-6 py-2.5 text-sm text-white hover:opacity-90"
      >
        重试
      </button>
    </div>
  );
}
