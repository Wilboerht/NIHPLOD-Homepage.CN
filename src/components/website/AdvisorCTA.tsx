"use client";

import { cn } from "@/lib/utils";

interface AdvisorCTAProps {
  /** 引导文案，支持变体 */
  variant?: "guide" | "discover" | "empty-cart";
  className?: string;
}

const COPY = {
  guide:
    "想让护肤方案更精准？AI 测肤为你定制专属方案",
  discover:
    "不知道该选哪款？先测肤质，找到最适合你的产品",
  "empty-cart":
    "还不确定买什么？先测肤质找到最适合你的产品",
} as const;

/**
 * advisor.nihplod.cn 肤质自测工具引导卡片
 * 在多个页面中复用，统一视觉风格
 */
export function AdvisorCTA({ variant = "discover", className }: AdvisorCTAProps) {
  return (
    <a
      href="https://advisor.nihplod.cn"
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group flex items-center gap-3 rounded-2xl border border-brand-charcoal/10 bg-gradient-to-br from-[#FBF8F0] to-[#F5F0E8] px-5 py-4 transition-all duration-500 hover:border-brand-charcoal/20 hover:shadow-[0_4px_20px_rgba(0,38,62,0.06)]",
        className
      )}
    >
      {/* 图标 */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-charcoal/5">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5 text-brand-charcoal/70"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
          <path d="M9 2a12.05 12.05 0 0 0 0 20" />
          <path d="M15 2a12.05 12.05 0 0 1 0 20" />
          <path d="M2 12h20" />
        </svg>
      </div>

      {/* 文案 */}
      <div className="min-w-0 flex-1 text-left">
        <p className="text-sm font-light leading-relaxed tracking-[0.04em] text-brand-charcoal">
          {COPY[variant]}
        </p>
      </div>

      {/* 箭头 */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4 shrink-0 text-brand-charcoal/40 transition-transform duration-500 group-hover:translate-x-1"
      >
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
      </svg>
    </a>
  );
}
