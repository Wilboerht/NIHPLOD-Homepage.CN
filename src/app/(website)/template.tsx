"use client";

import { ReactNode } from "react";
import { m, useReducedMotion } from "framer-motion";

interface TemplateProps {
  children: ReactNode;
}

/**
 * 页面过渡动画变体
 */
const pageVariants = {
  initial: {
    opacity: 0,
    y: 12,
  },
  enter: {
    opacity: 1,
    y: 0,
  },
  exit: {
    opacity: 0,
    y: -8,
  },
};

/**
 * 降级动画变体（用于 prefers-reduced-motion）
 */
const reducedPageVariants = {
  initial: { opacity: 0 },
  enter: { opacity: 1 },
  exit: { opacity: 0 },
};

/**
 * 页面过渡动画配置
 */
const pageTransition = {
  type: "tween",
  ease: [0.25, 0.1, 0.25, 1],
  duration: 0.4,
};

const reducedTransition = {
  duration: 0.15,
};

/**
 * 网站页面过渡模板
 * 每次路由切换时会重新挂载，实现丝滑的页面过渡动画
 */
export default function WebsiteTemplate({ children }: TemplateProps) {
  const prefersReducedMotion = useReducedMotion();

  const variants = prefersReducedMotion ? reducedPageVariants : pageVariants;
  const transition = prefersReducedMotion ? reducedTransition : pageTransition;

  return (
    <m.div
      initial="initial"
      animate="enter"
      exit="exit"
      variants={variants}
      transition={transition}
    >
      {children}
    </m.div>
  );
}

