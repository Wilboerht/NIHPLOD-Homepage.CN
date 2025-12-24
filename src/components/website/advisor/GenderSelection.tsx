"use client";

import { m } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** 性别选项类型 */
export type GenderType = "female" | "male" | "unspecified";

interface GenderOption {
  value: GenderType;
  label: string;
  emoji: string;
  description: string;
}

const genderOptions: GenderOption[] = [
  {
    value: "female",
    label: "女性",
    emoji: "👩",
    description: "Female",
  },
  {
    value: "male",
    label: "男性",
    emoji: "👨",
    description: "Male",
  },
  {
    value: "unspecified",
    label: "暂不透露",
    emoji: "🤫",
    description: "Prefer not to say",
  },
];

interface GenderSelectionProps {
  selectedGender: GenderType | null;
  onSelect: (gender: GenderType) => void;
}

/**
 * 性别选择组件
 * 在问卷开始前询问用户性别，用于个性化问卷内容
 */
export function GenderSelection({ selectedGender, onSelect }: GenderSelectionProps) {
  return (
    <div className="flex flex-col items-center">
      {/* 标题区域 */}
      <m.div
        className="mb-8 text-center"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <p className="mb-2 text-[11px] font-light uppercase tracking-[0.25em] text-brand-gold/70 sm:text-xs">
          Before We Start
        </p>
        <h2 className="font-serif text-2xl font-light tracking-wide text-brand-charcoal sm:text-3xl">
          请选择您的性别
        </h2>
        <p className="mt-3 text-sm font-light text-brand-charcoal/50">
          我们将为您推荐更适合的护肤方案
        </p>
      </m.div>

      {/* 选项列表 */}
      <div className="w-full max-w-sm space-y-3">
        {genderOptions.map((option, index) => (
          <m.button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.4,
              delay: index * 0.08,
              ease: [0.4, 0, 0.2, 1],
            }}
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.985 }}
            className={cn(
              "group relative w-full overflow-hidden rounded-2xl text-left transition-all duration-300",
              "focus:outline-none focus:ring-2 focus:ring-brand-gold/50 focus:ring-offset-2 focus:ring-offset-brand-cream",
              selectedGender === option.value
                ? "shadow-luxury-lg"
                : "shadow-card hover:shadow-card-hover"
            )}
          >
            {/* 背景层 */}
            <div
              className={cn(
                "absolute inset-0 transition-all duration-300",
                selectedGender === option.value
                  ? "bg-gradient-to-br from-white via-brand-champagne/30 to-white"
                  : "bg-white/90 backdrop-blur-sm group-hover:bg-white"
              )}
            />

            {/* 边框 */}
            <div
              className={cn(
                "absolute inset-0 rounded-2xl transition-all duration-300",
                selectedGender === option.value
                  ? "border-2 border-brand-gold"
                  : "border border-brand-beige/60 group-hover:border-brand-gold/40"
              )}
            />

            {/* 内容 */}
            <div className="relative z-10 flex items-center gap-4 p-4">
              {/* Emoji */}
              <div
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl transition-all duration-300",
                  selectedGender === option.value
                    ? "bg-gradient-to-br from-brand-gold/15 to-brand-champagne/40"
                    : "bg-brand-cream/80 group-hover:bg-brand-cream"
                )}
              >
                {option.emoji}
              </div>

              {/* 文本 */}
              <div className="flex-1">
                <p className="font-medium tracking-wide text-brand-charcoal">
                  {option.label}
                </p>
                <p className="mt-0.5 text-sm text-brand-charcoal/50">
                  {option.description}
                </p>
              </div>

              {/* 选中指示器 */}
              <div
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full transition-all duration-300",
                  selectedGender === option.value
                    ? "bg-gradient-to-br from-brand-gold to-brand-gold-dark"
                    : "border-2 border-brand-beige/70 bg-white group-hover:border-brand-gold/40"
                )}
              >
                {selectedGender === option.value && (
                  <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                )}
              </div>
            </div>
          </m.button>
        ))}
      </div>
    </div>
  );
}

