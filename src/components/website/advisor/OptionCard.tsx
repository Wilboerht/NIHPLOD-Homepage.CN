"use client";

import { m } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface OptionCardProps {
  value: string;
  label: string;
  description: string;
  emoji?: string;
  isSelected: boolean;
  onClick: () => void;
  index: number;
}

/**
 * 问题选项卡片组件
 * 支持选中状态、动画效果
 */
export function OptionCard({
  label,
  description,
  emoji,
  isSelected,
  onClick,
  index,
}: OptionCardProps) {
  return (
    <m.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.3,
        delay: index * 0.05,
        ease: "easeOut",
      }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "relative w-full rounded-2xl border-2 p-4 text-left transition-all duration-200",
        "focus:outline-none focus:ring-2 focus:ring-brand-gold focus:ring-offset-2",
        isSelected
          ? "border-brand-gold bg-brand-gold/5 shadow-md"
          : "border-brand-beige/60 bg-white hover:border-brand-gold/50 hover:shadow-sm"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Emoji 图标 */}
        {emoji && (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-cream text-xl">
            {emoji}
          </span>
        )}

        {/* 文本内容 */}
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "font-medium transition-colors",
              isSelected ? "text-brand-gold" : "text-brand-charcoal"
            )}
          >
            {label}
          </p>
          <p className="mt-0.5 text-sm text-brand-charcoal/60">{description}</p>
        </div>

        {/* 选中图标 */}
        <div
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all",
            isSelected
              ? "bg-brand-gold text-white"
              : "border-2 border-brand-beige bg-white"
          )}
        >
          {isSelected && <Check className="h-4 w-4" />}
        </div>
      </div>
    </m.button>
  );
}

