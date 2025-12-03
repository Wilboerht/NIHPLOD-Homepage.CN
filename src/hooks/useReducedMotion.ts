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

/**
 * 获取动画配置（根据用户偏好）
 * 
 * @param normalDuration - 正常动画时长（秒）
 * @param reducedDuration - 减少动画时长（秒），默认 0.01
 * @returns 动画时长
 */
export function getAnimationDuration(
  normalDuration: number,
  reducedDuration: number = 0.01
): number {
  if (typeof window === "undefined") return normalDuration;
  
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  
  return prefersReducedMotion ? reducedDuration : normalDuration;
}

/**
 * 获取动画过渡配置
 * 
 * @param normalTransition - 正常过渡配置
 * @returns 根据用户偏好调整后的过渡配置
 */
export function getReducedMotionTransition(normalTransition: {
  duration?: number;
  delay?: number;
  [key: string]: unknown;
}): typeof normalTransition {
  if (typeof window === "undefined") return normalTransition;
  
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  
  if (prefersReducedMotion) {
    return {
      ...normalTransition,
      duration: 0.01,
      delay: 0,
    };
  }
  
  return normalTransition;
}

export default useReducedMotion;

