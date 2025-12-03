"use client";

import { LazyMotion, domAnimation, MotionConfig } from "framer-motion";
import { ReactNode } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface MotionProviderProps {
  children: ReactNode;
}

/**
 * MotionProvider - 提供 Framer Motion 的 LazyMotion 功能
 *
 * 使用 LazyMotion + domAnimation 可以减少 bundle 大小
 * 只加载必要的动画功能
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
    <LazyMotion features={domAnimation} strict>
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
