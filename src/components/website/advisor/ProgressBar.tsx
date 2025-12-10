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
 * 进度条组件 - NIHPLOD 品牌风格
 *
 * 采用分段式设计，每段代表一个问题
 * 简约、优雅、符合高端护肤品牌调性
 */
export function ProgressBar({
  current,
  total,
  showPercentage: _showPercentage = false,
  compact = false,
}: ProgressBarProps) {
  // 紧凑模式：细线进度条
  if (compact) {
    const progress = (current / total) * 100;
    return (
      <div className="w-full">
        <div className="h-0.5 w-full overflow-hidden bg-brand-beige/40">
          <m.div
            className="h-full bg-brand-gold"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md items-center gap-4 lg:max-w-lg">
      {/* 分段进度指示器 */}
      <div className="flex flex-1 items-center gap-2 sm:gap-2.5 lg:gap-3">
        {Array.from({ length: total }, (_, i) => {
          const isCompleted = i + 1 < current;
          const isCurrent = i + 1 === current;

          return (
            <m.div
              key={i}
              className="relative h-1.5 flex-1 overflow-hidden rounded-full sm:h-2 lg:h-[5px]"
              style={{
                backgroundColor: isCompleted || isCurrent
                  ? "transparent"
                  : "rgba(232, 226, 217, 0.35)", // brand-beige/35
              }}
            >
              {/* 已完成或当前段的填充 */}
              {(isCompleted || isCurrent) && (
                <m.div
                  className="absolute inset-0 rounded-full bg-gradient-to-r from-brand-gold to-brand-gold/80"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{
                    duration: 0.4,
                    ease: [0.4, 0, 0.2, 1],
                    delay: isCurrent ? 0.1 : 0,
                  }}
                  style={{ transformOrigin: "left" }}
                />
              )}
            </m.div>
          );
        })}
      </div>

      {/* 步骤数字 */}
      <span className="min-w-[2.5rem] text-right text-[11px] font-light tracking-widest text-brand-charcoal/40 sm:text-xs lg:min-w-[3rem] lg:text-xs">
        {current}/{total}
      </span>
    </div>
  );
}

