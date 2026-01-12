"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Link } from "next-view-transitions";
import { m } from "framer-motion";
import { ArrowLeft, Scan } from "lucide-react";
import { FaceCapture, type FaceCaptureImages } from "@/components/website/advisor/FaceCapture";
import { useAdvisorAnalytics } from "@/hooks/useAdvisorAnalytics";
import { fadeInUp, staggerContainer, defaultTransition } from "@/lib/animations";

/**
 * 面部扫描页面内容
 * 用户必须拍照进行 AI 面部分析（必选步骤）
 */
export function FaceScanContent() {
  const router = useRouter();
  const [hasAnswers, setHasAnswers] = useState(false);
  const { trackFaceScanStart, trackFaceScanComplete } = useAdvisorAnalytics();
  const hasTrackedStart = useRef(false);

  // 检查是否有问答数据
  useEffect(() => {
    const answers = sessionStorage.getItem("advisorAnswers");
    if (!answers) {
      // 没有问答数据，返回问答页
      router.replace("/advisor/questions");
      return;
    }
    setHasAnswers(true);

    // 追踪面部扫描开始
    if (!hasTrackedStart.current) {
      trackFaceScanStart();
      hasTrackedStart.current = true;
    }
  }, [router, trackFaceScanStart]);

  /**
   * 处理照片捕获 - 接收三张照片
   */
  const handleCapture = useCallback(
    (images: FaceCaptureImages) => {
      // 保存所有三张照片数据到 sessionStorage
      sessionStorage.setItem("advisorFaceImages", JSON.stringify(images));
      // 同时保留正脸照片作为主图（用于结果页显示）
      sessionStorage.setItem("advisorFaceImage", images.front);
      // 追踪面部扫描完成
      trackFaceScanComplete();
      // 跳转到分析页面
      router.push("/advisor/analyzing");
    },
    [router, trackFaceScanComplete]
  );

  // 等待检查问答数据
  if (!hasAnswers) {
    return (
      <div className="flex h-screen items-center justify-center overflow-hidden">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-[#F0EDE1] px-3 py-2 sm:px-4 sm:py-3 md:px-6 md:py-4">
      {/* 顶部导航栏 */}
      <header className="flex shrink-0 items-center justify-start">
        {/* 返回按钮 */}
        <Link
          href="/advisor/questions"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-brand-charcoal shadow-sm backdrop-blur-sm transition-colors hover:bg-white sm:h-9 sm:w-9"
          aria-label="返回"
        >
          <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
        </Link>
      </header>

      {/* 主内容区域 */}
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center py-2 sm:py-3">
        <m.div
          className="flex w-full max-w-sm flex-col sm:max-w-md"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          {/* 标题区域 */}
          <m.div
            variants={fadeInUp}
            transition={defaultTransition}
            className="mb-2 shrink-0 text-center sm:mb-3"
          >
            {/* 图标 + 标题 一行显示 */}
            <div className="flex items-center justify-center gap-2 sm:gap-3">
              <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-gold/10 sm:h-10 sm:w-10">
                <Scan className="h-4 w-4 text-brand-gold sm:h-5 sm:w-5" />
              </div>
              <h1 className="font-serif text-lg text-brand-charcoal sm:text-xl md:text-2xl">
                AI 肌肤检测
              </h1>
            </div>
            <p className="mt-1 text-xs text-brand-charcoal/60 sm:text-sm">
              拍摄素颜照片，AI 将分析您的肌肤状态
            </p>
          </m.div>

          {/* 拍照组件 */}
          <m.div variants={fadeInUp} transition={defaultTransition} className="min-h-0 flex-1">
            <FaceCapture onCapture={handleCapture} />
          </m.div>
        </m.div>
      </main>
    </div>
  );
}

