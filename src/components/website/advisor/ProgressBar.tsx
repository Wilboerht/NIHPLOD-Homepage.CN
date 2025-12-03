"use client";

import { m } from "framer-motion";

interface ProgressBarProps {
  current: number;
  total: number;
  /** 是否显示百分比（移动端可隐藏） */
  showPercentage?: boolean;
  /** 是否使用紧凑模式（仅显示进度条） */
  compact?: boolean;
}

/**
 * 进度条组件
 * 显示当前问题进度
 *
 * 功能：
 * - 显示当前步骤 (1/6 格式)
 * - 进度条填充动画
 * - 响应式适配
 */
export function ProgressBar({
  current,
  total,
  showPercentage = true,
  compact = false,
}: ProgressBarProps) {
  const progress = (current / total) * 100;

  // 紧凑模式：仅显示进度条
  if (compact) {
    return (
      <div className="w-full">
        <div className="h-1 w-full overflow-hidden rounded-full bg-brand-beige/50 md:h-1.5">
          <m.div
            className="h-full rounded-full bg-brand-gold"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* 进度文本 - 响应式设计 */}
      <div className="mb-1.5 flex items-center justify-between text-xs text-brand-charcoal/60 md:mb-2">
        {/* 步骤指示：移动端简化显示 */}
        <span className="font-medium">
          <span className="hidden sm:inline">问题 </span>
          {current} / {total}
        </span>

        {/* 百分比：可选显示，移动端默认隐藏 */}
        {showPercentage && (
          <span className="hidden sm:inline">{Math.round(progress)}%</span>
        )}
      </div>

      {/* 进度条 - 响应式高度 */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-brand-beige/50 md:h-1.5">
        <m.div
          className="h-full rounded-full bg-gradient-to-r from-brand-gold to-brand-gold/80"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{
            duration: 0.4,
            ease: [0.4, 0, 0.2, 1], // 自然缓动曲线
          }}
        />
      </div>

      {/* 步骤点指示器（桌面端可见） */}
      <div className="mt-2 hidden items-center justify-between md:flex">
        {Array.from({ length: total }, (_, i) => (
          <m.div
            key={i}
            className={`h-2 w-2 rounded-full transition-colors duration-200 ${
              i + 1 <= current
                ? "bg-brand-gold"
                : "bg-brand-beige"
            }`}
            initial={{ scale: 0.8 }}
            animate={{
              scale: i + 1 === current ? 1.2 : 1,
            }}
            transition={{ duration: 0.2 }}
          />
        ))}
      </div>
    </div>
  );
}

