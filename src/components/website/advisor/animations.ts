import { Variants, Transition } from "framer-motion";

/**
 * 问题页面切换动画配置
 * 支持正向/反向滑动动画
 */

/**
 * 滑动动画变体
 * direction > 0: 向前（从右侧滑入）
 * direction < 0: 向后（从左侧滑入）
 */
export const slideVariants: Variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 300 : -300,
    opacity: 0,
  }),
};

/**
 * 滑动过渡配置
 * 使用弹簧动画实现自然的物理效果
 */
export const slideTransition: Transition = {
  x: { type: "spring", stiffness: 300, damping: 30 },
  opacity: { duration: 0.2 },
};

/**
 * 淡入上移动画变体
 * 用于选项卡片等元素
 */
export const fadeInUpVariants: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

/**
 * 交错动画容器
 * 子元素依次动画
 */
export const staggerContainerVariants: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

/**
 * 降级动画配置
 * 当用户设置 prefers-reduced-motion 时使用
 */
export const reducedMotionVariants: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
};

export const reducedMotionTransition: Transition = {
  duration: 0.15,
};

/**
 * 按钮悬停动画
 */
export const buttonHoverVariants = {
  hover: { scale: 1.02 },
  tap: { scale: 0.98 },
};

/**
 * 进度条动画
 */
export const progressBarVariants: Variants = {
  initial: { width: 0 },
  animate: (progress: number) => ({
    width: `${progress}%`,
  }),
};

export const progressTransition: Transition = {
  duration: 0.4,
  ease: [0.4, 0, 0.2, 1],
};

