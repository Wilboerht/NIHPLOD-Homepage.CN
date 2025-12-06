"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { m } from "framer-motion";
import { ArrowLeft, Scan, SkipForward } from "lucide-react";
import { FaceCapture } from "@/components/website/advisor/FaceCapture";
import { fadeInUp, staggerContainer, defaultTransition } from "@/lib/animations";

/**
 * 面部扫描页面内容
 * 用户可以拍照或上传照片进行 AI 面部分析
 */
export function FaceScanContent() {
  const router = useRouter();
  const [hasAnswers, setHasAnswers] = useState(false);

  // 检查是否有问答数据
  useEffect(() => {
    const answers = sessionStorage.getItem("advisorAnswers");
    if (!answers) {
      // 没有问答数据，返回问答页
      router.replace("/advisor/questions");
      return;
    }
    setHasAnswers(true);
  }, [router]);

  /**
   * 处理照片捕获
   */
  const handleCapture = useCallback(
    (imageData: string) => {
      // 保存照片数据到 sessionStorage
      sessionStorage.setItem("advisorFaceImage", imageData);
      // 跳转到分析页面
      router.push("/advisor/analyzing");
    },
    [router]
  );

  /**
   * 跳过面部扫描
   */
  const handleSkip = useCallback(() => {
    // 清除可能存在的旧照片数据
    sessionStorage.removeItem("advisorFaceImage");
    // 直接跳转到分析页面
    router.push("/advisor/analyzing");
  }, [router]);

  // 等待检查问答数据
  if (!hasAnswers) {
    return (
      <div className="flex h-screen items-center justify-center overflow-hidden">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="relative flex h-screen flex-col overflow-hidden px-4 py-3 md:px-6 md:py-4">
      {/* 顶部导航栏 */}
      <header className="flex shrink-0 items-center justify-between">
        {/* 返回按钮 */}
        <Link
          href="/advisor/questions"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-brand-charcoal shadow-sm backdrop-blur-sm transition-colors hover:bg-white"
          aria-label="返回"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>

        {/* 跳过按钮 */}
        <button
          onClick={handleSkip}
          className="flex items-center gap-1.5 text-sm text-brand-charcoal/60 transition-colors hover:text-brand-charcoal"
        >
          跳过此步
          <SkipForward className="h-4 w-4" />
        </button>
      </header>

      {/* 主内容区域 */}
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center py-3">
        <m.div
          className="flex w-full max-w-md flex-col"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          {/* 标题区域 */}
          <m.div
            variants={fadeInUp}
            transition={defaultTransition}
            className="mb-3 shrink-0 text-center"
          >
            {/* 图标 + 标题 一行显示 */}
            <div className="flex items-center justify-center gap-3">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-gold/10">
                <Scan className="h-5 w-5 text-brand-gold" />
              </div>
              <h1 className="font-serif text-xl text-brand-charcoal md:text-2xl">
                AI 肌肤检测
              </h1>
            </div>
            <p className="mt-1 text-sm text-brand-charcoal/60">
              拍摄素颜照片，AI 将分析您的肌肤状态
            </p>
          </m.div>

          {/* 拍照组件 */}
          <m.div variants={fadeInUp} transition={defaultTransition} className="min-h-0 flex-1">
            <FaceCapture onCapture={handleCapture} onSkip={handleSkip} />
          </m.div>

          {/* 提示说明 - 简化为一行 */}
          <m.div
            variants={fadeInUp}
            transition={defaultTransition}
            className="mt-3 shrink-0 text-center text-xs text-brand-charcoal/50"
          >
            💡 请在光线充足的环境下素颜拍摄，将面部正对镜头
          </m.div>
        </m.div>
      </main>
    </div>
  );
}

