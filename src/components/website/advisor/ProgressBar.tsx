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
 * 进度条组件 - NIHPLOD 高奢品牌风格
 *
 * 采用珠链式设计，每个珠子代表一个问题步骤
 * 优雅、精致、符合高端护肤品牌调性
 */
export function ProgressBar({
  current,
  total,
  showPercentage: _showPercentage = false,
  compact = false,
}: ProgressBarProps) {
  // 紧凑模式：优雅细线进度条
  if (compact) {
    const progress = (current / total) * 100;
    return (
      <div className="w-full">
        <div className="h-[2px] w-full overflow-hidden rounded-full bg-gradient-to-r from-brand-beige/30 via-brand-beige/50 to-brand-beige/30">
          <m.div
            className="h-full bg-gradient-to-r from-brand-gold via-brand-gold-light to-brand-gold"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md items-center gap-3 lg:max-w-lg lg:gap-4">
      {/* 珠链式进度指示器 */}
      <div className="relative flex flex-1 items-center justify-between">
        {/* 连接线 - 背景 */}
        <div className="absolute left-2 right-2 top-1/2 h-[1px] -translate-y-1/2 bg-gradient-to-r from-brand-beige/40 via-brand-beige/60 to-brand-beige/40 sm:left-2.5 sm:right-2.5" />

        {/* 连接线 - 进度填充 */}
        <m.div
          className="absolute left-2 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-gradient-to-r from-brand-gold to-brand-gold-light sm:left-2.5"
          initial={{ width: 0 }}
          animate={{
            width: current > 1
              ? `calc(${((current - 1) / (total - 1)) * 100}% - 16px)`
              : 0
          }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        />

        {/* 珠子节点 */}
        {Array.from({ length: total }, (_, i) => {
          const stepNum = i + 1;
          const isCompleted = stepNum < current;
          const isCurrent = stepNum === current;
          const isPending = stepNum > current;

          return (
            <m.div
              key={i}
              className="relative z-10 flex items-center justify-center"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
            >
              {/* 珠子外圈 */}
              <m.div
                className={`
                  flex h-4 w-4 items-center justify-center rounded-full transition-all duration-300
                  sm:h-5 sm:w-5
                  ${isCompleted
                    ? "bg-gradient-to-br from-brand-gold to-brand-gold-dark shadow-glow-gold"
                    : isCurrent
                      ? "border-2 border-brand-gold bg-white shadow-luxury"
                      : "border border-brand-beige bg-white/80"
                  }
                `}
                animate={isCurrent ? {
                  boxShadow: [
                    "0 0 0 0 rgba(201, 168, 108, 0.2)",
                    "0 0 0 6px rgba(201, 168, 108, 0)",
                  ]
                } : {}}
                transition={isCurrent ? {
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeOut"
                } : {}}
              >
                {/* 完成状态的勾选标记 */}
                {isCompleted && (
                  <m.svg
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 300 }}
                    className="h-2 w-2 text-white sm:h-2.5 sm:w-2.5"
                    viewBox="0 0 12 12"
                    fill="none"
                  >
                    <path
                      d="M2.5 6L5 8.5L9.5 4"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </m.svg>
                )}

                {/* 当前状态的中心点 */}
                {isCurrent && (
                  <m.div
                    className="h-1.5 w-1.5 rounded-full bg-brand-gold sm:h-2 sm:w-2"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                )}
              </m.div>
            </m.div>
          );
        })}
      </div>

      {/* 步骤数字 - 优雅徽章样式 */}
      <div className="flex items-center gap-1.5 rounded-full border border-brand-beige/50 bg-white/60 px-2.5 py-1 backdrop-blur-sm sm:px-3">
        <span className="font-serif text-xs font-medium text-brand-gold sm:text-sm">
          {current}
        </span>
        <span className="text-[10px] text-brand-charcoal/30">/</span>
        <span className="text-[10px] text-brand-charcoal/40 sm:text-xs">
          {total}
        </span>
      </div>
    </div>
  );
}

