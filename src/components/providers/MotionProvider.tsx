"use client";

import { LazyMotion, domMax, MotionConfig } from "framer-motion";
import { ReactNode } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface MotionProviderProps {
  children: ReactNode;
}

/**
 * MotionProvider - 提供 Framer Motion 的 LazyMotion 功能
 *
 * 使用 LazyMotion + domMax 可以支持所有动画特性（包括 layout 布局动画）
 * 同时保持较好的 tree-shaking
 *
 * 自动检测 prefers-reduced-motion 并应用全局降级配置
 *
 * 用法:
 * - 在 layout.tsx 中包裹整个应用
 * - 使用 m 代替 motion 组件以获得更好的 tree-shaking
 *
 * 示例:
 * ```tsx
 * import { m } from "framer-motion";
 *
 * <m.div
 *   initial={{ opacity: 0 }}
 *   animate={{ opacity: 1 }}
 * >
 *   Content
 * </m.div>
 * ```
 */
export function MotionProvider({ children }: MotionProviderProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig
        reducedMotion={prefersReducedMotion ? "always" : "never"}
        transition={
          prefersReducedMotion
            ? { duration: 0.01 }
            : undefined
        }
      >
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}

export default MotionProvider;
