"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Link } from "next-view-transitions";
import { m } from "framer-motion";
import { ArrowLeft, ArrowRight, X, Loader2 } from "lucide-react";
import { useAdvisorQuestions } from "@/hooks/useAdvisorQuestions";
import { useAdvisorAnalytics } from "@/hooks/useAdvisorAnalytics";
import { QuestionStep, ProgressBar } from "@/components/website/advisor";
import { cn } from "@/lib/utils";

/**
 * 用户答案类型
 * 单选题为 string，多选题为 string[]
 */
type Answers = Record<string, string | string[]>;

/**
 * 问答流程组件
 * 管理问题切换、答案收集、进度显示
 */
export function QuestionsFlow() {
  const router = useRouter();
  const { initSession, trackQuestionnaireStart, trackQuestionnaireComplete } = useAdvisorAnalytics();
  const hasTrackedStart = useRef(false);

  // 动态获取问题数据
  const { questions, totalQuestions, loading, source: _source } = useAdvisorQuestions();

  // 当前问题索引（从 0 开始）
  const [currentIndex, setCurrentIndex] = useState(0);
  // 用户答案
  const [answers, setAnswers] = useState<Answers>({});
  // 动画方向：1 向前，-1 向后
  const [direction, setDirection] = useState(1);
  // 是否正在过渡动画中
  const [isTransitioning, setIsTransitioning] = useState(false);

  // 初始化会话（确保即使用户直接访问问题页也能创建会话）
  useEffect(() => {
    initSession();
  }, [initSession]);

  // 追踪问卷开始
  useEffect(() => {
    if (!loading && !hasTrackedStart.current) {
      trackQuestionnaireStart();
      hasTrackedStart.current = true;
    }
  }, [loading, trackQuestionnaireStart]);

  // 当前问题（需要处理加载状态）
  const currentQuestion = questions[currentIndex];
  // 判断当前问题是否为多选
  const isMultipleChoice = currentQuestion?.type === "multiple";
  // 当前问题的已选答案
  const currentAnswer = currentQuestion ? (answers[currentQuestion.fieldName] || null) : null;
  // 判断是否有有效答案（单选非空，多选数组长度 > 0）
  const hasValidAnswer = isMultipleChoice
    ? Array.isArray(currentAnswer) && currentAnswer.length > 0
    : !!currentAnswer;

  /**
   * 选择选项
   */
  const handleSelect = useCallback(
    (value: string) => {
      if (isTransitioning || !currentQuestion) return;

      if (isMultipleChoice) {
        // 多选模式：切换选中状态
        setAnswers((prev) => {
          const prevAnswer = prev[currentQuestion.fieldName];
          const prevArray = Array.isArray(prevAnswer) ? prevAnswer : [];
          const newArray = prevArray.includes(value)
            ? prevArray.filter((v) => v !== value)
            : [...prevArray, value];
          return {
            ...prev,
            [currentQuestion.fieldName]: newArray,
          };
        });
        // 多选模式不自动跳转
      } else {
        // 单选模式：保存答案并自动跳转
        setAnswers((prev) => ({
          ...prev,
          [currentQuestion.fieldName]: value,
        }));

        // 自动跳转到下一题（延迟以显示选中动画）
        if (currentIndex < totalQuestions - 1) {
          setIsTransitioning(true);
          setTimeout(() => {
            setDirection(1);
            setCurrentIndex((prev) => prev + 1);
            setIsTransitioning(false);
          }, 300);
        }
      }
    },
    [currentIndex, currentQuestion, totalQuestions, isTransitioning, isMultipleChoice]
  );

  /**
   * 上一题
   */
  const handlePrev = useCallback(() => {
    if (currentIndex > 0 && !isTransitioning) {
      setIsTransitioning(true);
      setDirection(-1);
      setTimeout(() => {
        setCurrentIndex((prev) => prev - 1);
        setIsTransitioning(false);
      }, 50);
    }
  }, [currentIndex, isTransitioning]);

  /**
   * 下一题
   */
  const handleNext = useCallback(() => {
    if (currentIndex < totalQuestions - 1 && hasValidAnswer && !isTransitioning) {
      setIsTransitioning(true);
      setDirection(1);
      setTimeout(() => {
        setCurrentIndex((prev) => prev + 1);
        setIsTransitioning(false);
      }, 50);
    }
  }, [currentIndex, totalQuestions, hasValidAnswer, isTransitioning]);

  /**
   * 完成问答，跳转到面部识别或结果页
   */
  const handleComplete = useCallback(() => {
    if (!hasValidAnswer || !currentQuestion) return;

    // 保存最后一个答案（确保 currentAnswer 存在）
    const finalAnswers = {
      ...answers,
      ...(currentAnswer !== null && { [currentQuestion.fieldName]: currentAnswer }),
    };

    // 将答案存储到 sessionStorage
    sessionStorage.setItem("advisorAnswers", JSON.stringify(finalAnswers));

    // 追踪问卷完成
    trackQuestionnaireComplete(finalAnswers);

    // 跳转到面部识别页面（可选步骤）
    router.push("/advisor/face-scan");
  }, [answers, currentAnswer, hasValidAnswer, currentQuestion, router, trackQuestionnaireComplete]);

  /**
   * 键盘导航支持
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        handlePrev();
      } else if (e.key === "ArrowRight" && hasValidAnswer) {
        if (currentIndex === totalQuestions - 1) {
          handleComplete();
        } else {
          handleNext();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePrev, handleNext, handleComplete, hasValidAnswer, currentIndex, totalQuestions]);

  const isLastQuestion = currentIndex === totalQuestions - 1;

  // 加载状态
  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-brand-cream">
        <m.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <Loader2 className="h-8 w-8 animate-spin text-brand-gold" />
          <p className="text-sm text-brand-charcoal/60">正在加载问题...</p>
        </m.div>
      </div>
    );
  }

  // 无问题时显示错误状态
  if (!currentQuestion || questions.length === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-brand-cream px-6">
        <p className="text-center text-brand-charcoal/60">暂无问卷问题</p>
        <Link
          href="/advisor"
          className="rounded-full bg-brand-gold px-6 py-3 text-sm font-medium text-white"
        >
          返回首页
        </Link>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-gradient-cream px-4 py-6 md:px-6 lg:px-12 lg:py-8 xl:px-16">
      {/* 背景装饰 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 -top-20 h-40 w-40 rounded-full bg-gradient-radial-gold opacity-50" />
        <div className="absolute -bottom-10 -right-10 h-32 w-32 rounded-full bg-gradient-radial-gold opacity-30" />
      </div>

      {/* 顶部导航栏 */}
      <header className="relative z-10 flex items-center justify-between">
        {/* 返回按钮 - 优雅的圆形按钮 */}
        {currentIndex === 0 ? (
          <Link
            href="/advisor"
            className="group flex h-10 w-10 items-center justify-center rounded-full border border-brand-beige bg-white/80 text-brand-charcoal/60 shadow-card backdrop-blur-sm transition-all duration-300 hover:border-brand-gold/40 hover:bg-white hover:text-brand-charcoal hover:shadow-card-hover lg:h-11 lg:w-11"
            aria-label="返回"
          >
            <X className="h-5 w-5 transition-transform group-hover:scale-110 lg:h-[22px] lg:w-[22px]" />
          </Link>
        ) : (
          <m.button
            onClick={handlePrev}
            className="group flex h-10 w-10 items-center justify-center rounded-full border border-brand-beige bg-white/80 text-brand-charcoal/60 shadow-card backdrop-blur-sm transition-all duration-300 hover:border-brand-gold/40 hover:bg-white hover:text-brand-charcoal hover:shadow-card-hover lg:h-11 lg:w-11"
            aria-label="上一题"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <ArrowLeft className="h-5 w-5 transition-transform group-hover:-translate-x-0.5 lg:h-[22px] lg:w-[22px]" />
          </m.button>
        )}

        {/* 进度指示器 */}
        <div className="flex-1 px-4 lg:px-8">
          <ProgressBar current={currentIndex + 1} total={totalQuestions} />
        </div>

        {/* 品牌标识占位 */}
        <div className="flex h-10 w-10 items-center justify-center lg:h-11 lg:w-11">
          <span className="text-[10px] font-light uppercase tracking-[0.2em] text-brand-gold/60">
            旎柏
          </span>
        </div>
      </header>

      {/* 问题内容区域 */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center py-6 md:py-8">
        <div className="w-full max-w-md lg:max-w-lg">
          <QuestionStep
            question={currentQuestion}
            selectedValue={currentAnswer}
            onSelect={handleSelect}
            direction={direction}
          />
        </div>
      </main>

      {/* 底部导航按钮 */}
      <footer className="relative z-10 flex items-center justify-center pb-6 pt-2">
        {/* 优雅的下一题/完成按钮 */}
        <m.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: hasValidAnswer ? 1 : 0.5, y: 0 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          onClick={isLastQuestion ? handleComplete : handleNext}
          disabled={!hasValidAnswer}
          className={cn(
            "group relative flex items-center gap-2.5 overflow-hidden rounded-full px-10 py-3.5 text-sm font-light tracking-wider transition-all duration-300 sm:px-12 sm:py-4",
            hasValidAnswer
              ? "border border-brand-gold/30 bg-white/90 text-brand-charcoal shadow-card backdrop-blur-sm hover:border-brand-gold hover:shadow-luxury"
              : "cursor-not-allowed border border-brand-beige/40 bg-white/50 text-brand-charcoal/30"
          )}
        >
          {/* 悬停时的光泽效果 */}
          {hasValidAnswer && (
            <span className="absolute inset-0 -translate-x-full bg-shimmer transition-transform duration-700 group-hover:translate-x-full" />
          )}
          <span className="relative">
            {isLastQuestion ? "深度面部分析" : "下一题"}
          </span>
          <ArrowRight className={cn(
            "relative h-4 w-4 transition-transform duration-200",
            hasValidAnswer && "group-hover:translate-x-0.5"
          )} />
        </m.button>
      </footer>
    </div>
  );
}

