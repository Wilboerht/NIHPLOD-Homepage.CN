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
 * 问题选项卡片组件 - NIHPLOD 高奢品牌风格
 * 毛玻璃效果、金色边框、优雅动画
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
        duration: 0.4,
        delay: index * 0.06,
        ease: [0.4, 0, 0.2, 1],
      }}
      whileHover={{
        scale: 1.015,
        transition: { duration: 0.2 }
      }}
      whileTap={{ scale: 0.985 }}
      className={cn(
        "group relative w-full overflow-hidden rounded-2xl text-left transition-all duration-300",
        "focus:outline-none focus:ring-2 focus:ring-brand-gold/50 focus:ring-offset-2 focus:ring-offset-brand-cream",
        isSelected
          ? "shadow-luxury-lg"
          : "shadow-card hover:shadow-card-hover"
      )}
    >
      {/* 背景层 */}
      <div
        className={cn(
          "absolute inset-0 transition-all duration-300",
          isSelected
            ? "bg-gradient-to-br from-white via-brand-champagne/30 to-white"
            : "bg-white/90 backdrop-blur-sm group-hover:bg-white"
        )}
      />

      {/* 金色边框效果 */}
      <div
        className={cn(
          "absolute inset-0 rounded-2xl transition-all duration-300",
          isSelected
            ? "border-2 border-brand-gold"
            : "border border-brand-beige/60 group-hover:border-brand-gold/40"
        )}
      />

      {/* 选中时的微光效果 */}
      {isSelected && (
        <m.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-brand-gold/10 to-transparent"
          initial={{ x: "-100%" }}
          animate={{ x: "100%" }}
          transition={{ duration: 1.5, ease: "easeInOut" }}
        />
      )}

      {/* 内容区域 */}
      <div className="relative z-10 flex items-start gap-3.5 p-3.5 sm:p-4.5">
        {/* Emoji 图标 - 优雅圆形容器 */}
        {emoji && (
          <m.div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl transition-all duration-300",
              isSelected
                ? "bg-gradient-to-br from-brand-gold/15 to-brand-champagne/40 shadow-sm"
                : "bg-brand-cream/80 group-hover:bg-brand-cream"
            )}
            animate={isSelected ? { scale: [1, 1.05, 1] } : {}}
            transition={{ duration: 0.3 }}
          >
            {emoji}
          </m.div>
        )}

        {/* 文本内容 */}
        <div className="flex-1 min-w-0 pt-0.5">
          <p
            className={cn(
              "text-base font-medium tracking-wide transition-colors duration-200 sm:text-lg",
              isSelected
                ? "text-brand-charcoal"
                : "text-brand-charcoal group-hover:text-brand-charcoal"
            )}
          >
            {label}
          </p>
          <p
            className={cn(
              "mt-1 text-xs leading-relaxed transition-colors duration-200 sm:text-sm",
              isSelected
                ? "text-brand-charcoal/70"
                : "text-brand-charcoal/50 group-hover:text-brand-charcoal/60"
            )}
          >
            {description}
          </p>
        </div>

        {/* 选中指示器 - 优雅的金色圆环 */}
        <div className="flex-shrink-0 pt-0.5">
          <m.div
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full transition-all duration-300",
              isSelected
                ? "bg-gradient-to-br from-brand-gold to-brand-gold-dark shadow-sm"
                : "border-2 border-brand-beige/70 bg-white group-hover:border-brand-gold/40"
            )}
            animate={isSelected ? { scale: [0.9, 1.1, 1] } : {}}
            transition={{ duration: 0.3 }}
          >
            {isSelected && (
              <m.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
              >
                <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
              </m.div>
            )}
          </m.div>
        </div>
      </div>

      {/* 底部装饰线 - 仅选中时显示 */}
      {isSelected && (
        <m.div
          className="absolute bottom-0 left-1/2 h-0.5 -translate-x-1/2 rounded-full bg-gradient-to-r from-transparent via-brand-gold to-transparent"
          initial={{ width: 0 }}
          animate={{ width: "60%" }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        />
      )}
    </m.button>
  );
}

