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
    x: 8,
  },
  enter: {
    opacity: 1,
    x: 0,
  },
};

/**
 * 降级动画变体
 */
const reducedPageVariants = {
  initial: { opacity: 0 },
  enter: { opacity: 1 },
};

/**
 * 页面过渡动画配置
 */
const pageTransition = {
  type: "tween",
  ease: [0.25, 0.1, 0.25, 1],
  duration: 0.25,
};

const reducedTransition = {
  duration: 0.1,
};

/**
 * 管理后台页面过渡模板
 */
export default function AdminTemplate({ children }: TemplateProps) {
  const prefersReducedMotion = useReducedMotion();

  const variants = prefersReducedMotion ? reducedPageVariants : pageVariants;
  const transition = prefersReducedMotion ? reducedTransition : pageTransition;

  return (
    <m.div
      initial="initial"
      animate="enter"
      variants={variants}
      transition={transition}
    >
      {children}
    </m.div>
  );
}

