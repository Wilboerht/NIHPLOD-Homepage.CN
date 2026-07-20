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
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    // 检测媒体查询
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    // 设置初始值
    setPrefersReducedMotion(mediaQuery.matches);

    // 监听变化
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
