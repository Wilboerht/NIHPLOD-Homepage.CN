"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Link } from "next-view-transitions";
import { m, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, X, Loader2, LogOut } from "lucide-react";
import { useAdvisorQuestions } from "@/hooks/useAdvisorQuestions";
import { useAdvisorAnalytics } from "@/hooks/useAdvisorAnalytics";
import { QuestionStep, ProgressBar, GenderSelection, type GenderType } from "@/components/website/advisor";
import { cn } from "@/lib/utils";

/**
 * 用户答案类型
 * 单选题为 string，多选题为 string[]
 */
type Answers = Record<string, string | string[]>;

/**
 * 问答流程组件
 * 管理问题切换、答案收集、进度显示
 * 新增：性别选择步骤，根据性别过滤问卷问题
 */
export function QuestionsFlow() {
  const router = useRouter();
  const { initSession, trackQuestionnaireStart, trackQuestionnaireComplete } = useAdvisorAnalytics();
  const hasTrackedStart = useRef(false);

  // 性别选择状态
  const [selectedGender, setSelectedGender] = useState<GenderType | null>(null);
  const [showGenderStep, setShowGenderStep] = useState(true);

  // 退出确认对话框状态
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // 用户答案
  const [answers, setAnswers] = useState<Answers>({});

  // 动态获取问题数据（传入性别参数）
  const { questions: allQuestions, loading, source: _source } = useAdvisorQuestions(
    showGenderStep ? undefined : selectedGender
  );

  // 根据性别和前置条件过滤问题
  const questions = useMemo(() => {
    let filtered = allQuestions;

    // 1. 性别过滤
    if (selectedGender && selectedGender !== "unspecified") {
      filtered = allQuestions.filter(q => {
        const qGender = (q as { gender?: string }).gender;
        return !qGender || qGender === "all" || qGender === selectedGender;
      });
    }

    // 2. 前置条件过滤 (Hardcoded logic)
    return filtered.filter(q => {
      // 医美经历问题：只有当处于“特殊时期”选“否”时才显示
      if (q.fieldName === "medicalBeautyHistory") {
        return answers["pregnancyStatus"] === "no";
      }
      return true;
    });
  }, [allQuestions, selectedGender, answers]);

  const totalQuestions = questions.length;

  // 当前问题索引（从 0 开始）
  const [currentIndex, setCurrentIndex] = useState(0);

  // 动画方向：1 向前，-1 向后
  const [direction, setDirection] = useState(1);
  // 是否正在过渡动画中
  const [isTransitioning, setIsTransitioning] = useState(false);

  // 初始化会话（确保即使用户直接访问问题页也能创建会话）
  useEffect(() => {
    initSession();
  }, [initSession]);

  // 追踪问卷开始（在选择性别后）
  useEffect(() => {
    if (!loading && !showGenderStep && !hasTrackedStart.current) {
      trackQuestionnaireStart();
      hasTrackedStart.current = true;
    }
  }, [loading, showGenderStep, trackQuestionnaireStart]);

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
        } else {
          // 最后一题：自动完成并跳转
          setIsTransitioning(true);
          setTimeout(() => {
            // 这里需要使用最新的 value，而不是 state 中的值（因为 state 更新是异步的）
            const finalAnswers = {
              ...answers,
              [currentQuestion.fieldName]: value,
              gender: selectedGender,
            };

            // 将答案存储到 sessionStorage
            sessionStorage.setItem("advisorAnswers", JSON.stringify(finalAnswers));

            // 追踪问卷完成
            trackQuestionnaireComplete({
              ...finalAnswers,
              gender: selectedGender || "unspecified",
            });

            // 跳转到面部识别页面
            router.push("/advisor/face-scan");
          }, 300);
        }
      }
    },
    [
      currentIndex,
      currentQuestion,
      totalQuestions,
      isTransitioning,
      isMultipleChoice,
      answers,
      selectedGender,
      router,
      trackQuestionnaireComplete
    ]
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
   * 处理性别选择
   */
  const handleGenderSelect = useCallback((gender: GenderType) => {
    setSelectedGender(gender);
    // 保存性别到 sessionStorage
    sessionStorage.setItem("advisorGender", gender);
    // 延迟切换到问卷，显示选中动画
    setTimeout(() => {
      setShowGenderStep(false);
      setDirection(1);
    }, 300);
  }, []);

  /**
   * 返回性别选择步骤
   */
  const handleBackToGender = useCallback(() => {
    setShowGenderStep(true);
    setCurrentIndex(0);
    setDirection(-1);
  }, []);

  /**
   * 打开退出确认对话框
   */
  const handleExitClick = useCallback(() => {
    setShowExitConfirm(true);
  }, []);

  /**
   * 确认退出测试
   */
  const handleConfirmExit = useCallback(() => {
    // 清除已保存的数据
    sessionStorage.removeItem("advisorAnswers");
    sessionStorage.removeItem("advisorGender");
    router.push("/advisor");
  }, [router]);

  /**
   * 取消退出
   */
  const handleCancelExit = useCallback(() => {
    setShowExitConfirm(false);
  }, []);

  /**
   * 完成问答，跳转到面部识别或结果页
   */
  const handleComplete = useCallback(() => {
    if (!hasValidAnswer || !currentQuestion) return;

    // 保存最后一个答案（确保 currentAnswer 存在）
    const finalAnswers = {
      ...answers,
      ...(currentAnswer !== null && { [currentQuestion.fieldName]: currentAnswer }),
      // 添加性别信息到答案中
      gender: selectedGender,
    };

    // 将答案存储到 sessionStorage
    sessionStorage.setItem("advisorAnswers", JSON.stringify(finalAnswers));

    // 追踪问卷完成
    trackQuestionnaireComplete({
      ...finalAnswers,
      gender: selectedGender || "unspecified",
    });

    // 跳转到面部识别页面（可选步骤）
    router.push("/advisor/face-scan");
  }, [answers, currentAnswer, hasValidAnswer, currentQuestion, router, trackQuestionnaireComplete, selectedGender]);

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

  // 加载状态（仅在非性别选择步骤时显示）
  if (loading && !showGenderStep) {
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

  // 无问题时显示错误状态（仅在选择性别后）
  if (!showGenderStep && (!currentQuestion || questions.length === 0)) {
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
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-gradient-cream px-3 sm:px-4 md:px-6 lg:px-12 xl:px-16">
      {/* 背景装饰 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 -top-20 h-40 w-40 rounded-full bg-gradient-radial-gold opacity-50" />
        <div className="absolute -bottom-10 -right-10 h-32 w-32 rounded-full bg-gradient-radial-gold opacity-30" />
      </div>

      <header className={cn(
        "z-10 flex shrink-0 items-center justify-between py-3 sm:py-4 md:py-6",
        showGenderStep
          ? "absolute left-0 top-0 w-full px-3 sm:px-4 md:px-6 lg:px-12 xl:px-16"
          : "relative"
      )}>
        {/* 返回按钮 - 优雅的圆形按钮 */}
        {showGenderStep ? (
          <Link
            href="/advisor"
            className="group flex h-9 w-9 items-center justify-center rounded-full border border-brand-beige bg-white/80 text-brand-charcoal/60 shadow-card backdrop-blur-sm transition-all duration-300 hover:border-brand-gold/40 hover:bg-white hover:text-brand-charcoal hover:shadow-card-hover sm:h-10 sm:w-10 lg:h-11 lg:w-11"
            aria-label="返回"
          >
            <X className="h-4 w-4 transition-transform group-hover:scale-110 sm:h-5 sm:w-5 lg:h-[22px] lg:w-[22px]" />
          </Link>
        ) : currentIndex === 0 ? (
          <m.button
            onClick={handleBackToGender}
            className="group flex h-9 w-9 items-center justify-center rounded-full border border-brand-beige bg-white/80 text-brand-charcoal/60 shadow-card backdrop-blur-sm transition-all duration-300 hover:border-brand-gold/40 hover:bg-white hover:text-brand-charcoal hover:shadow-card-hover sm:h-10 sm:w-10 lg:h-11 lg:w-11"
            aria-label="返回性别选择"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5 sm:h-5 sm:w-5 lg:h-[22px] lg:w-[22px]" />
          </m.button>
        ) : (
          <m.button
            onClick={handlePrev}
            className="group flex h-9 w-9 items-center justify-center rounded-full border border-brand-beige bg-white/80 text-brand-charcoal/60 shadow-card backdrop-blur-sm transition-all duration-300 hover:border-brand-gold/40 hover:bg-white hover:text-brand-charcoal hover:shadow-card-hover sm:h-10 sm:w-10 lg:h-11 lg:w-11"
            aria-label="上一题"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5 sm:h-5 sm:w-5 lg:h-[22px] lg:w-[22px]" />
          </m.button>
        )}

        {/* 进度指示器 - 性别选择步骤不显示 */}
        <div className="flex-1 px-2 sm:px-4 lg:px-8">
          {showGenderStep ? (
            <div className="h-1" /> // 占位
          ) : (
            <ProgressBar current={currentIndex + 1} total={totalQuestions} />
          )}
        </div>

        {/* 退出按钮 - 在问卷步骤显示 */}
        {!showGenderStep ? (
          <m.button
            onClick={handleExitClick}
            className="group flex h-9 w-9 items-center justify-center rounded-full border border-brand-beige bg-white/80 text-brand-charcoal/60 shadow-card backdrop-blur-sm transition-all duration-300 hover:border-red-400/50 hover:bg-white hover:text-red-500 hover:shadow-card-hover sm:h-10 sm:w-10 lg:h-11 lg:w-11"
            aria-label="退出测试"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <LogOut className="h-4 w-4 transition-transform group-hover:translate-x-0.5 sm:h-5 sm:w-5 lg:h-[22px] lg:w-[22px]" />
          </m.button>
        ) : (
          <div className="flex h-9 w-9 items-center justify-center sm:h-10 sm:w-10 lg:h-11 lg:w-11">
            <span className="text-[9px] font-light uppercase tracking-[0.15em] text-brand-gold/60 sm:text-[10px] sm:tracking-[0.2em]">
              旎柏
            </span>
          </div>
        )}
      </header>

      {/* 主内容区域 - 垂直居中，隐藏滚动条 */}
      <main
        className="relative z-10 flex flex-1 flex-col overflow-y-auto overflow-x-hidden"
        style={{
          scrollbarWidth: 'none', /* Firefox */
          msOverflowStyle: 'none', /* IE/Edge */
        }}
      >
        <style jsx>{`
          main::-webkit-scrollbar {
            display: none; /* Chrome, Safari, Opera */
          }
        `}</style>
        <div className="my-auto flex w-full flex-col items-center justify-center py-6">
          <AnimatePresence mode="wait">
            {showGenderStep ? (
              /* 性别选择步骤 */
              <m.div
                key="gender-step"
                className="w-full max-w-sm sm:max-w-md lg:max-w-lg"
                initial={{ opacity: 0, x: direction > 0 ? 50 : -50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction > 0 ? -50 : 50 }}
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              >
                <GenderSelection
                  selectedGender={selectedGender}
                  onSelect={handleGenderSelect}
                />
              </m.div>
            ) : (
              /* 问卷问题步骤 */
              <m.div
                key="question-step"
                className="w-full max-w-sm sm:max-w-md lg:max-w-lg"
                initial={{ opacity: 0, x: direction > 0 ? 50 : -50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction > 0 ? -50 : 50 }}
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              >
                {currentQuestion && (
                  <QuestionStep
                    question={currentQuestion}
                    selectedValue={currentAnswer}
                    onSelect={handleSelect}
                    direction={direction}
                  />
                )}
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* 底部导航按钮 - 性别选择步骤不显示 */}
      {!showGenderStep && (
        <footer className="relative z-10 flex items-center justify-center pb-4 pt-2 sm:pb-6">
          {/* 优雅的下一题/完成按钮 */}
          <m.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: hasValidAnswer ? 1 : 0.5, y: 0 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            onClick={isLastQuestion ? handleComplete : handleNext}
            disabled={!hasValidAnswer}
            className={cn(
              "group relative flex items-center gap-2.5 overflow-hidden rounded-full px-8 py-3 text-sm font-light tracking-wider transition-all duration-300 sm:px-12 sm:py-4 sm:text-base",
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
      )}

      {/* 退出确认对话框 - 使用 Portal 渲染到 body 确保正确居中 */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {showExitConfirm && (
              <>
                {/* 背景遮罩 */}
                <m.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm"
                  onClick={handleCancelExit}
                />
                {/* 对话框 */}
                <m.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                  className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
                >
                  <div className="w-full max-w-sm rounded-2xl border border-brand-beige/60 bg-white/95 p-6 shadow-luxury backdrop-blur-md sm:p-8">
                    {/* 图标 */}
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-red-50 to-red-100">
                      <LogOut className="h-6 w-6 text-red-500" />
                    </div>
                    {/* 标题 */}
                    <h3 className="mb-2 text-center font-serif text-lg font-medium tracking-wide text-brand-charcoal">
                      确认退出测试？
                    </h3>
                    {/* 描述 */}
                    <p className="mb-6 text-center text-sm text-brand-charcoal/60">
                      您的测试进度将不会被保存，确定要退出吗？
                    </p>
                    {/* 按钮组 */}
                    <div className="flex gap-3">
                      <button
                        onClick={handleCancelExit}
                        className="flex-1 rounded-full border border-brand-beige bg-white py-3 text-sm font-medium text-brand-charcoal transition-all duration-200 hover:border-brand-gold/40 hover:shadow-card"
                      >
                        继续测试
                      </button>
                      <button
                        onClick={handleConfirmExit}
                        className="flex-1 rounded-full bg-gradient-to-r from-red-500 to-red-600 py-3 text-sm font-medium text-white shadow-md transition-all duration-200 hover:from-red-600 hover:to-red-700 hover:shadow-lg"
                      >
                        确认退出
                      </button>
                    </div>
                  </div>
                </m.div>
              </>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}

