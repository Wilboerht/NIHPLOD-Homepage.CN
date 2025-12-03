"use client";

import { m, AnimatePresence, useReducedMotion } from "framer-motion";
import { Question } from "@/config/advisor-questions";
import { OptionCard } from "./OptionCard";
import {
  slideVariants,
  slideTransition,
  reducedMotionVariants,
  reducedMotionTransition,
} from "./animations";

interface QuestionStepProps {
  question: Question;
  selectedValue: string | null;
  onSelect: (value: string) => void;
  direction: number; // 1: 向前, -1: 向后
}

/**
 * 问题步骤组件
 * 显示单个问题及其选项，支持动画过渡
 *
 * 功能：
 * - 进入动画：从右侧滑入（向前）/ 从左侧滑入（向后）
 * - 退出动画：向左侧滑出（向前）/ 向右侧滑出（向后）
 * - 支持 prefers-reduced-motion 降级
 */
export function QuestionStep({
  question,
  selectedValue,
  onSelect,
  direction,
}: QuestionStepProps) {
  // 检测用户是否偏好减少动画
  const prefersReducedMotion = useReducedMotion();

  // 根据用户偏好选择动画配置
  const variants = prefersReducedMotion ? reducedMotionVariants : slideVariants;
  const transition = prefersReducedMotion ? reducedMotionTransition : slideTransition;

  return (
    <AnimatePresence mode="wait" custom={direction}>
      <m.div
        key={question.id}
        custom={direction}
        variants={variants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={transition}
        className="w-full"
      >
        {/* 问题标题 */}
        <div className="mb-6 text-center">
          <h2 className="font-serif text-2xl text-brand-charcoal md:text-3xl">
            {question.question}
          </h2>
          {question.subtext && (
            <p className="mt-2 text-sm text-brand-charcoal/60">
              {question.subtext}
            </p>
          )}
        </div>

        {/* 选项列表 */}
        <div className="space-y-3">
          {question.options.map((option, index) => (
            <OptionCard
              key={option.value}
              value={option.value}
              label={option.label}
              description={option.description}
              emoji={option.emoji}
              isSelected={selectedValue === option.value}
              onClick={() => onSelect(option.value)}
              index={prefersReducedMotion ? 0 : index} // 降级时不交错动画
            />
          ))}
        </div>
      </m.div>
    </AnimatePresence>
  );
}

