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
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col px-4 py-6 md:px-6">
      {/* 顶部导航栏 */}
      <header className="flex items-center justify-between">
        {/* 返回按钮 */}
        <Link
          href="/advisor/questions"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-brand-charcoal shadow-sm backdrop-blur-sm transition-colors hover:bg-white"
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
      <main className="flex flex-1 flex-col items-center justify-center py-6">
        <m.div
          className="w-full max-w-md"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          {/* 标题区域 */}
          <m.div
            variants={fadeInUp}
            transition={defaultTransition}
            className="mb-6 text-center"
          >
            {/* 图标 */}
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-brand-gold/10">
              <Scan className="h-8 w-8 text-brand-gold" />
            </div>

            {/* 标题 */}
            <h1 className="font-serif text-2xl text-brand-charcoal md:text-3xl">
              AI 肌肤检测
            </h1>

            {/* 说明 */}
            <p className="mt-2 text-sm text-brand-charcoal/60">
              拍摄一张素颜照片，AI 将分析您的肌肤状态
            </p>
          </m.div>

          {/* 拍照组件 */}
          <m.div variants={fadeInUp} transition={defaultTransition}>
            <FaceCapture onCapture={handleCapture} onSkip={handleSkip} />
          </m.div>

          {/* 提示说明 */}
          <m.div
            variants={fadeInUp}
            transition={defaultTransition}
            className="mt-6 rounded-xl bg-brand-cream/50 p-4"
          >
            <h3 className="mb-2 text-sm font-medium text-brand-charcoal">
              📸 拍照小贴士
            </h3>
            <ul className="space-y-1 text-xs text-brand-charcoal/60">
              <li>• 请在光线充足的环境下拍摄</li>
              <li>• 建议素颜或卸妆后拍摄</li>
              <li>• 将面部正对镜头，保持自然表情</li>
              <li>• 确保面部完整显示在框内</li>
            </ul>
          </m.div>
        </m.div>
      </main>
    </div>
  );
}

