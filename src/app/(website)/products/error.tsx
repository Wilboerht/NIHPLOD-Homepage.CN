"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { logger } from "@/lib/logger";

interface ProductsErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ProductsError({ error, reset }: ProductsErrorProps) {
  useEffect(() => {
    logger.error("Products route error", {
      error,
      digest: error.digest,
      component: "ProductsError",
    });
  }, [error]);

  return (
    <div
      role="alert"
      className="flex h-full min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center"
    >
      <TriangleAlert className="h-10 w-10 text-brand-primary/40" aria-hidden="true" />
      <h1 className="mt-4 font-serif text-2xl text-brand-charcoal md:text-3xl">产品内容加载失败</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-brand-charcoal/60">
        请检查网络后重试。如果问题持续，可返回产品列表。
      </p>
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-full bg-brand-primary px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          重试
        </button>
        <Link
          href="/products"
          className="rounded-full border border-brand-charcoal/20 px-6 py-2.5 text-sm font-medium text-brand-charcoal transition-colors hover:border-brand-charcoal hover:bg-brand-charcoal hover:text-white"
        >
          返回产品列表
        </Link>
      </div>
    </div>
  );
}
