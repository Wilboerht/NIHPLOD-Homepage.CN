"use client";

import { useState, useEffect } from "react";

/**
 * 检测用户是否偏好减少动画
 *
 * 用法：
 * ```tsx
 * const prefersReducedMotion = useReducedMotion();
 *
 * // 根据用户偏好选择动画配置
 * const variants = prefersReducedMotion ? reducedMotionVariants : normalVariants;
 * ```
 *
 * @returns boolean - true 表示用户偏好减少动画
 */
export function useReducedMotion(): boolean {
  // 懒初始化：直接读取媒体查询，避免 effect 内同步 setState
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () =>
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    // 监听变化
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  return prefersReducedMotion;
}
