"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { m } from "framer-motion";
import { ArrowLeft, ArrowRight, X, Loader2 } from "lucide-react";
import { useAdvisorQuestions } from "@/hooks/useAdvisorQuestions";
import { QuestionStep, ProgressBar } from "@/components/website/advisor";
import { cn } from "@/lib/utils";

/**
 * 用户答案类型
 */
type Answers = Record<string, string>;

/**
 * 问答流程组件
 * 管理问题切换、答案收集、进度显示
 */
export function QuestionsFlow() {
  const router = useRouter();

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

  // 当前问题（需要处理加载状态）
  const currentQuestion = questions[currentIndex];
  // 当前问题的已选答案
  const currentAnswer = currentQuestion ? (answers[currentQuestion.fieldName] || null) : null;

  /**
   * 选择选项
   */
  const handleSelect = useCallback(
    (value: string) => {
      if (isTransitioning || !currentQuestion) return;

      // 保存答案
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
    },
    [currentIndex, currentQuestion, totalQuestions, isTransitioning]
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
    if (currentIndex < totalQuestions - 1 && currentAnswer && !isTransitioning) {
      setIsTransitioning(true);
      setDirection(1);
      setTimeout(() => {
        setCurrentIndex((prev) => prev + 1);
        setIsTransitioning(false);
      }, 50);
    }
  }, [currentIndex, totalQuestions, currentAnswer, isTransitioning]);

  /**
   * 完成问答，跳转到面部识别或结果页
   */
  const handleComplete = useCallback(() => {
    if (!currentAnswer || !currentQuestion) return;

    // 保存最后一个答案
    const finalAnswers = {
      ...answers,
      [currentQuestion.fieldName]: currentAnswer,
    };

    // 将答案存储到 sessionStorage
    sessionStorage.setItem("advisorAnswers", JSON.stringify(finalAnswers));

    // 跳转到面部识别页面（可选步骤）
    router.push("/advisor/face-scan");
  }, [answers, currentAnswer, currentQuestion, router]);

  /**
   * 键盘导航支持
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        handlePrev();
      } else if (e.key === "ArrowRight" && currentAnswer) {
        if (currentIndex === totalQuestions - 1) {
          handleComplete();
        } else {
          handleNext();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePrev, handleNext, handleComplete, currentAnswer, currentIndex, totalQuestions]);

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
    <div className="relative flex h-screen flex-col overflow-hidden px-4 py-6 md:px-6">
      {/* 顶部导航栏 */}
      <header className="flex items-center justify-between">
        {/* 返回按钮 */}
        {currentIndex === 0 ? (
          <Link
            href="/advisor"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-brand-charcoal shadow-sm backdrop-blur-sm transition-colors hover:bg-white"
            aria-label="返回"
          >
            <X className="h-5 w-5" />
          </Link>
        ) : (
          <button
            onClick={handlePrev}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-brand-charcoal shadow-sm backdrop-blur-sm transition-colors hover:bg-white"
            aria-label="上一题"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}

        {/* 进度指示器 */}
        <div className="flex-1 px-4">
          <ProgressBar current={currentIndex + 1} total={totalQuestions} />
        </div>

        {/* 跳过按钮（占位） */}
        <div className="w-10" />
      </header>

      {/* 问题内容区域 */}
      <main className="flex flex-1 flex-col items-center justify-center py-8">
        <div className="w-full max-w-md">
          <QuestionStep
            question={currentQuestion}
            selectedValue={currentAnswer}
            onSelect={handleSelect}
            direction={direction}
          />
        </div>
      </main>

      {/* 底部导航按钮 */}
      <footer className="flex items-center justify-between pb-4">
        {/* 左侧：上一题按钮（仅非第一题显示） */}
        <div>
          {currentIndex > 0 && (
            <m.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={handlePrev}
              className="flex items-center gap-1 text-sm text-brand-charcoal/60 transition-colors hover:text-brand-charcoal"
            >
              <ArrowLeft className="h-4 w-4" />
              上一题
            </m.button>
          )}
        </div>

        {/* 右侧：下一题/完成按钮 */}
        <m.button
          initial={{ opacity: 0 }}
          animate={{ opacity: currentAnswer ? 1 : 0.5 }}
          onClick={isLastQuestion ? handleComplete : handleNext}
          disabled={!currentAnswer}
          className={cn(
            "flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium transition-all",
            currentAnswer
              ? "bg-brand-gold text-white shadow-md hover:bg-brand-gold/90"
              : "cursor-not-allowed bg-brand-beige text-brand-charcoal/40"
          )}
        >
          {isLastQuestion ? "查看结果" : "下一题"}
          <ArrowRight className="h-4 w-4" />
        </m.button>
      </footer>
    </div>
  );
}

