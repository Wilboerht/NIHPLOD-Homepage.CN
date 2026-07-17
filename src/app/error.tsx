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
      <h1 className="text-xl font-medium text-[#00263E]">出现了一些问题</h1>
      <p className="text-sm text-[#00263E]/60">抱歉，页面加载时发生了错误，请稍后再试。</p>
      {process.env.NODE_ENV === "development" && error.message && (
        <p className="max-w-md rounded-lg border border-[#00263E]/10 bg-[#00263E]/5 px-4 py-3 text-xs text-[#00263E]/60 font-mono">
          {error.message}
        </p>
      )}
      <button
        onClick={() => reset()}
        className="rounded-full bg-[#00263E] px-6 py-2.5 text-sm text-white hover:opacity-90"
      >
        重试
      </button>
    </div>
  );
}
