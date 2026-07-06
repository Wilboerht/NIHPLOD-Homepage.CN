import { Variants } from "framer-motion";

// ============================================
// Framer Motion 动画预设
// ============================================

/**
 * 淡入上移动画
 */
export const fadeInUp: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

/**
 * 淡入动画
 */
export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

/**
 * 缩放淡入
 */
export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.9 },
};

/**
 * 交错容器 - 子元素依次动画
 */
export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

/**
 * 慢速交错容器
 */
export const staggerContainerSlow: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.2,
      delayChildren: 0.2,
    },
  },
};

// ============================================
// 过渡配置
// ============================================

export const defaultTransition = {
  duration: 0.5,
  ease: "easeOut" as const,
};

export const springTransition = {
  type: "spring" as const,
  stiffness: 100,
  damping: 15,
};

export const slowTransition = {
  duration: 0.8,
  ease: "easeOut" as const,
};

// ============================================
// GSAP ScrollTrigger 预设
// ============================================

/**
 * 滚动淡入配置
 */
export const scrollFadeIn = {
  opacity: 0,
  y: 50,
  duration: 0.8,
  ease: "power2.out",
};

/**
 * 滚动淡入从左
 */
export const scrollFadeInLeft = {
  opacity: 0,
  x: -50,
  duration: 0.8,
  ease: "power2.out",
};

/**
 * 滚动淡入从右
 */
export const scrollFadeInRight = {
  opacity: 0,
  x: 50,
  duration: 0.8,
  ease: "power2.out",
};

/**
 * 滚动缩放
 */
export const scrollScaleIn = {
  opacity: 0,
  scale: 0.9,
  duration: 0.8,
  ease: "power2.out",
};

// ============================================
// 页面过渡动画
// ============================================

export const pageTransition: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const pageSlideTransition: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

// ============================================
// Hover 动画
// ============================================

export const hoverScale = {
  scale: 1.05,
  transition: { duration: 0.2 },
};

export const hoverLift = {
  y: -5,
  transition: { duration: 0.2 },
};

export const tapScale = {
  scale: 0.98,
};

// ============================================
// 降级动画配置 (prefers-reduced-motion)
// ============================================

/**
 * 降级动画变体 - 仅使用淡入淡出
 * 用于 prefers-reduced-motion: reduce 的用户
 */
export const reducedMotionVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

/**
 * 降级过渡配置 - 极短时长
 */
export const reducedMotionTransition = {
  duration: 0.01,
  ease: "easeOut" as const,
};

/**
 * 根据用户偏好获取动画变体
 * @param normalVariants - 正常动画变体
 * @param prefersReducedMotion - 是否偏好减少动画
 * @returns 适当的动画变体
 */
export function getVariants(
  normalVariants: Variants,
  prefersReducedMotion: boolean
): Variants {
  return prefersReducedMotion ? reducedMotionVariants : normalVariants;
}

/**
 * 根据用户偏好获取过渡配置
 * @param normalTransition - 正常过渡配置
 * @param prefersReducedMotion - 是否偏好减少动画
 * @returns 适当的过渡配置
 */
export function getTransition(
  normalTransition: typeof defaultTransition,
  prefersReducedMotion: boolean
): typeof defaultTransition {
  return prefersReducedMotion ? reducedMotionTransition : normalTransition;
}
