"use client";

import { m } from "framer-motion";

/**
 * 详情页客户端导航加载态：内容区居中的细环 spinner。
 * 立即挂载并快速淡入，避免骨架屏在快速加载时整页闪烁。
 */
export function ProductDetailLoading() {
  return (
    <div
      data-testid="product-detail-loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex h-full min-h-0 items-center justify-center"
    >
      <span className="sr-only">正在加载产品详情…</span>
      <m.div
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className="h-8 w-8 animate-spin rounded-full border-2 border-brand-charcoal/20 border-t-brand-charcoal motion-reduce:animate-none"
      />
    </div>
  );
}
