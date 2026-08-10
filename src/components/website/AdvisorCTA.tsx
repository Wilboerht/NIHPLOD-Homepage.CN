"use client";

import { cn } from "@/lib/utils";

interface AdvisorCTAProps {
  /** 引导文案，支持变体 */
  variant?: "guide" | "discover" | "empty-cart";
  className?: string;
}

const COPY = {
  guide: "参加肌智派素颜测肤，获取您的专属护肤秘籍——更少产品，科学护肤",
  discover: "参加肌智派素颜测肤，获取您的专属护肤秘籍——更少产品，科学护肤",
  "empty-cart": "参加肌智派素颜测肤，获取您的专属护肤秘籍——更少产品，科学护肤",
} as const;

/**
 * advisor.nihplod.cn 肤质自测工具引导链接
 * 移动端为带边框的卡片样式，桌面端为极简文字链接
 */
export function AdvisorCTA({ variant = "discover", className }: AdvisorCTAProps) {
  return (
    <div
      className={cn(
        "max-lg:rounded-lg max-lg:border max-lg:border-brand-charcoal/10 max-lg:px-4 max-lg:py-3",
        className
      )}
    >
      <a
        href="https://advisor.nihplod.cn"
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center gap-1 text-xs font-light leading-[1.8] tracking-[0.08em] text-brand-primary transition-opacity hover:opacity-70 lg:inline-flex lg:tracking-[0.12em]"
      >
        <span>{COPY[variant]}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="ml-auto h-3 w-3 shrink-0 transition-transform group-hover:translate-x-1 lg:ml-0"
        >
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      </a>
    </div>
  );
}
