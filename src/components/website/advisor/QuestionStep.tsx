"use client";

import { m, AnimatePresence, useReducedMotion } from "framer-motion";
import { type Question } from "@/hooks/useAdvisorQuestions";
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
 * 问题步骤组件 - NIHPLOD 高奢品牌风格
 * 显示单个问题及其选项，支持优雅的动画过渡
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
        {/* 问题标题区域 - 优雅的高奢风格 */}
        <div className="mb-8 text-center">
          {/* 装饰性分隔线 */}
          <m.div
            className="mx-auto mb-4 flex items-center justify-center gap-2"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            <span className="h-px w-6 bg-gradient-to-r from-transparent to-brand-gold/40" />
            <span className="h-1 w-1 rounded-full bg-brand-gold/60" />
            <span className="h-px w-6 bg-gradient-to-l from-transparent to-brand-gold/40" />
          </m.div>

          {/* 主标题 */}
          <m.h2
            className="font-serif text-xl font-light tracking-wide text-brand-charcoal sm:text-2xl md:text-[1.65rem]"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
          >
            {question.question}
          </m.h2>

          {/* 副标题 */}
          {question.subtext && (
            <m.p
              className="mt-2.5 text-sm font-light tracking-wider text-brand-charcoal/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25, duration: 0.4 }}
            >
              {question.subtext}
            </m.p>
          )}
        </div>

        {/* 选项列表 - 优雅间距 */}
        <div className="space-y-3.5">
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

