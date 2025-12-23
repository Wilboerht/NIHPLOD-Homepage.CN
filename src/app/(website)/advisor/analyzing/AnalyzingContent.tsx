"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { m, AnimatePresence } from "framer-motion";
import { Sparkles, Heart, Camera, FileText, RefreshCw } from "lucide-react";
import { preprocessFaceImage } from "@/lib/image-processing";
import { useAdvisorAnalytics } from "@/hooks/useAdvisorAnalytics";

/** 失败类型 */
type FailureType = "face" | "questionnaire" | null;

/** 加载提示文案 - 高奢品牌语调 */
const LOADING_TIPS = [
  { icon: "🔬", text: "正在解读您的肌肤密码..." },
  { icon: "💧", text: "评估肌肤水润状态..." },
  { icon: "✨", text: "分析肤色光泽度..." },
  { icon: "🎯", text: "识别需要关注的区域..." },
  { icon: "📊", text: "综合多维度数据..." },
  { icon: "💡", text: "定制您的专属方案..." },
];

/** 品牌小知识 - NIHPLOD 旎柏品牌故事 */
const BRAND_FACTS = [
  "真脂质体技术 — 源自摩纳哥的高端护肤科技",
  "NIHPLOD 旎柏 — 让每一寸肌肤都被温柔以待",
  "多肽精萃配方 — 唤醒肌肤自我修护能量",
  "植物精华与科技的完美融合",
  "专注于为您打造专属护肤仪式",
];

/**
 * 分析中页面内容
 */
export function AnalyzingContent() {
  const router = useRouter();
  const { trackAnalysisStart, trackAnalysisComplete } = useAdvisorAnalytics();
  const [progress, setProgress] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const [factIndex, setFactIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [failureType, setFailureType] = useState<FailureType>(null); // 记录失败类型
  const [medicalAdvice, setMedicalAdvice] = useState<string | null>(null); // 就医建议（需要特殊温和展示）
  const hasStarted = useRef(false);

  /**
   * 执行分析
   * 问卷和扫脸数据缺一不可，任一失败都会阻止继续
   */
  const runAnalysis = useCallback(async () => {
    // 追踪分析开始
    trackAnalysisStart();

    try {
      // 获取问答数据（必须）
      const answersStr = sessionStorage.getItem("advisorAnswers");
      if (!answersStr) {
        router.replace("/advisor");
        return;
      }

      const answers = JSON.parse(answersStr);

      // 获取面部图片（必须）- 优先使用三张照片，降级到单张
      const faceImagesStr = sessionStorage.getItem("advisorFaceImages");
      const faceImage = sessionStorage.getItem("advisorFaceImage");

      // 检查是否有面部图片
      if (!faceImagesStr && !faceImage) {
        // 没有面部图片，跳转到扫脸页面
        router.replace("/advisor/face-scan");
        return;
      }

      let faceAnalysis = null;

      // 面部图片分析（必须成功）
      try {
        let imagesToAnalyze: { front?: string; left?: string; right?: string } = {};

        if (faceImagesStr) {
          // 有三张照片，全部使用
          const faceImages = JSON.parse(faceImagesStr);
          // 预处理所有图片
          const [frontProcessed, leftProcessed, rightProcessed] = await Promise.all([
            preprocessFaceImage(faceImages.front),
            preprocessFaceImage(faceImages.left),
            preprocessFaceImage(faceImages.right),
          ]);
          imagesToAnalyze = {
            front: frontProcessed.imageData,
            left: leftProcessed.imageData,
            right: rightProcessed.imageData,
          };
        } else if (faceImage) {
          // 只有一张照片（降级模式）
          const processed = await preprocessFaceImage(faceImage);
          imagesToAnalyze = { front: processed.imageData };
        }

        setProgress((prev) => Math.max(prev, 20));

        // 调用面部分析 API - 发送所有照片
        const faceRes = await fetch("/api/advisor/face-analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ images: imagesToAnalyze }),
        });

        const faceData = await faceRes.json();

        if (faceRes.ok && faceData.success) {
          faceAnalysis = faceData.data;
          // 保存面部分析结果
          sessionStorage.setItem("advisorFaceAnalysis", JSON.stringify(faceData.data));
        } else if (faceData.error?.code === "VALIDATION_FAILED") {
          // 检查是否是需要就医的情况
          if (faceData.error.status === "medical_condition") {
            // 就医建议需要特殊处理，使用温和的界面展示
            setMedicalAdvice(faceData.error.message);
            return; // 直接返回，不继续分析
          }
          // 其他验证失败（非人脸、翻拍、视频帧等）- 标记为面部分析失败
          setFailureType("face");
          setError(faceData.error.message || "照片验证失败，请重新拍摄");
          return;
        } else {
          // 其他错误（如 AI 服务不可用）- 必须成功，不能跳过
          setFailureType("face");
          setError(faceData.error?.message || "面部分析失败，请重试");
          return;
        }

        setProgress((prev) => Math.max(prev, 50));
      } catch (e) {
        console.error("Face analysis failed:", e);
        // 面部分析失败，阻止继续
        setFailureType("face");
        setError(e instanceof Error ? e.message : "面部分析失败，请重试");
        return;
      }

      // 调用综合分析 API（必须成功）
      try {
        const res = await fetch("/api/advisor/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answers,
            faceAnalysis,
          }),
        });

        setProgress((prev) => Math.max(prev, 80));

        if (!res.ok) {
          setFailureType("questionnaire");
          setError("综合分析请求失败，请重试");
          return;
        }

        const data = await res.json();
        if (!data.success) {
          setFailureType("questionnaire");
          setError(data.error?.message || "综合分析失败，请重试");
          return;
        }

        // 保存分析结果
        sessionStorage.setItem("advisorResult", JSON.stringify(data.data));

        // 追踪分析完成
        trackAnalysisComplete(data.data.source || "ai");

        setProgress((prev) => Math.max(prev, 100));

        // 延迟跳转，让用户看到 100% 进度
        setTimeout(() => {
          router.push("/advisor/result");
        }, 500);
      } catch (e) {
        console.error("Comprehensive analysis failed:", e);
        setFailureType("questionnaire");
        setError(e instanceof Error ? e.message : "综合分析失败，请重试");
      }
    } catch (e) {
      console.error("Analysis error:", e);
      setError(e instanceof Error ? e.message : "分析失败，请重试");
    }
  }, [router, trackAnalysisStart, trackAnalysisComplete]);

  // 启动分析
  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    runAnalysis();
  }, [runAnalysis]);

  // 模拟进度（如果实际进度太慢）
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) return prev; // 接近完成时停止模拟
        // 缓慢增加，给真实请求时间
        const simulatedProgress = prev + Math.random() * 2;
        return simulatedProgress;
      });
    }, 300);

    return () => clearInterval(interval);
  }, []);

  // 切换提示文案
  useEffect(() => {
    const interval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % LOADING_TIPS.length);
    }, 2500);

    return () => clearInterval(interval);
  }, []);

  // 切换品牌知识
  useEffect(() => {
    const interval = setInterval(() => {
      setFactIndex((prev) => (prev + 1) % BRAND_FACTS.length);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  // 就医建议状态 - 使用温和、关心的 UI
  if (medicalAdvice) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <m.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-sm text-center"
        >
          {/* 温和的图标 */}
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-rose-100 to-pink-50">
            <Heart className="h-10 w-10 text-rose-400" />
          </div>

          {/* 温馨提示标题 */}
          <h2 className="mb-4 text-xl font-medium text-brand-charcoal">
            温馨提示
          </h2>

          {/* 就医建议内容 */}
          <div className="mb-8 rounded-2xl bg-gradient-to-br from-rose-50 to-pink-50 p-6">
            <p className="leading-relaxed text-brand-charcoal/80">
              {medicalAdvice}
            </p>
          </div>

          {/* 行动按钮 */}
          <button
            onClick={() => router.push("/advisor")}
            className="w-full rounded-full bg-brand-gold px-6 py-3 text-white transition-colors hover:bg-brand-gold/90"
          >
            我知道了
          </button>

          {/* 底部说明 */}
          <p className="mt-6 text-xs text-brand-charcoal/50">
            您的健康是我们最关心的事情 💕
          </p>
        </m.div>
      </div>
    );
  }

  // 错误状态 - 根据失败类型显示不同的操作按钮
  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <m.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-sm text-center"
        >
          {/* 错误图标 */}
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-red-100 to-orange-50">
            {failureType === "face" ? (
              <Camera className="h-10 w-10 text-red-400" />
            ) : failureType === "questionnaire" ? (
              <FileText className="h-10 w-10 text-orange-400" />
            ) : (
              <RefreshCw className="h-10 w-10 text-red-400" />
            )}
          </div>

          {/* 错误标题 */}
          <h2 className="mb-4 text-xl font-medium text-brand-charcoal">
            {failureType === "face" ? "面部分析失败" :
             failureType === "questionnaire" ? "综合分析失败" : "分析失败"}
          </h2>

          {/* 错误信息 */}
          <div className="mb-8 rounded-2xl bg-gradient-to-br from-red-50 to-orange-50 p-6">
            <p className="leading-relaxed text-brand-charcoal/80">
              {error}
            </p>
          </div>

          {/* 操作按钮 - 根据失败类型显示不同选项 */}
          <div className="space-y-3">
            {failureType === "face" ? (
              <>
                {/* 面部分析失败 - 提供重新拍照或重试AI分析 */}
                <button
                  onClick={() => router.push("/advisor/face-scan")}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-gold px-6 py-3 text-white transition-colors hover:bg-brand-gold/90"
                >
                  <Camera className="h-4 w-4" />
                  重新拍照
                </button>
                <button
                  onClick={() => {
                    setError(null);
                    setFailureType(null);
                    hasStarted.current = false;
                    setProgress(0);
                    runAnalysis();
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-brand-gold/30 bg-white px-6 py-3 text-brand-charcoal transition-colors hover:bg-brand-beige/30"
                >
                  <RefreshCw className="h-4 w-4" />
                  重试AI分析
                </button>
              </>
            ) : failureType === "questionnaire" ? (
              <>
                {/* 综合分析失败 - 提供重试或重新填写问卷 */}
                <button
                  onClick={() => {
                    setError(null);
                    setFailureType(null);
                    hasStarted.current = false;
                    setProgress(0);
                    runAnalysis();
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-gold px-6 py-3 text-white transition-colors hover:bg-brand-gold/90"
                >
                  <RefreshCw className="h-4 w-4" />
                  重试分析
                </button>
                <button
                  onClick={() => router.push("/advisor/questions")}
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-brand-gold/30 bg-white px-6 py-3 text-brand-charcoal transition-colors hover:bg-brand-beige/30"
                >
                  <FileText className="h-4 w-4" />
                  重新填写问卷
                </button>
              </>
            ) : (
              /* 通用失败 - 提供重试 */
              <button
                onClick={() => {
                  setError(null);
                  setFailureType(null);
                  hasStarted.current = false;
                  setProgress(0);
                  runAnalysis();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-gold px-6 py-3 text-white transition-colors hover:bg-brand-gold/90"
              >
                <RefreshCw className="h-4 w-4" />
                重试
              </button>
            )}

            {/* 返回首页 */}
            <button
              onClick={() => router.push("/advisor")}
              className="w-full text-sm text-brand-charcoal/60 transition-colors hover:text-brand-charcoal"
            >
              返回首页
            </button>
          </div>
        </m.div>
      </div>
    );
  }

  const currentTip = LOADING_TIPS[tipIndex];
  const currentFact = BRAND_FACTS[factIndex];

  return (
    <div
      className="relative flex h-screen flex-col items-center justify-center overflow-hidden bg-gradient-cream px-4"
      role="status"
      aria-live="polite"
      aria-label="正在分析您的肌肤状况"
    >
      {/* 背景装饰 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 -top-20 h-40 w-40 rounded-full bg-gradient-radial-gold opacity-40" />
        <div className="absolute -bottom-10 -right-10 h-32 w-32 rounded-full bg-gradient-radial-gold opacity-30" />
      </div>

      <div className="relative z-10 w-full max-w-sm text-center">
        {/* 优雅的旋转动画 */}
        <div className="relative mx-auto mb-10 h-28 w-28" aria-hidden="true">
          {/* 外圈旋转 - 金色渐变 */}
          <m.div
            className="absolute inset-0 rounded-full border-2 border-brand-gold/40"
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          />
          {/* 中圈反向旋转 */}
          <m.div
            className="absolute inset-3 rounded-full border border-dashed border-brand-gold/30"
            animate={{ rotate: -360 }}
            transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
          />
          {/* 内圈 */}
          <m.div
            className="absolute inset-6 rounded-full border border-brand-beige/50"
            animate={{ rotate: 360 }}
            transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
          />
          {/* 中心图标 */}
          <div className="absolute inset-0 flex items-center justify-center">
            <m.div
              className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-gold/20 to-brand-champagne/30 shadow-luxury"
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <Sparkles className="h-7 w-7 text-brand-gold" />
            </m.div>
          </div>
          {/* 进度指示点 */}
          <m.div
            className="absolute -right-1 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-gradient-to-br from-brand-gold to-brand-gold-dark shadow-glow-gold"
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "-55px center" }}
          />
        </div>

        {/* 动态提示文案 */}
        <div className="mb-8 h-8">
          <AnimatePresence mode="wait">
            <m.div
              key={tipIndex}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
              className="flex items-center justify-center gap-2.5 font-light tracking-wide text-brand-charcoal"
            >
              <span className="text-xl">{currentTip.icon}</span>
              <span>{currentTip.text}</span>
            </m.div>
          </AnimatePresence>
        </div>

        {/* 优雅进度条 */}
        <div className="mb-10">
          <div
            className="relative mb-3 h-1.5 overflow-hidden rounded-full bg-brand-beige/50"
            role="progressbar"
            aria-valuenow={Math.round(Math.min(progress, 100))}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="分析进度"
          >
            <m.div
              className="h-full rounded-full bg-gradient-to-r from-brand-gold via-brand-gold-light to-brand-gold"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(progress, 100)}%` }}
              transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            />
            {/* 光泽效果 */}
            <m.div
              className="absolute inset-0 bg-shimmer"
              animate={{ x: ["-100%", "100%"] }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            />
          </div>
          <span className="text-sm font-light tracking-wider text-brand-charcoal/50" aria-hidden="true">
            {Math.round(Math.min(progress, 100))}%
          </span>
        </div>

        {/* 品牌小知识 - 优雅卡片 */}
        <div className="rounded-2xl border border-brand-beige/40 bg-white/60 p-5 shadow-card backdrop-blur-sm">
          <div className="mb-2 flex items-center justify-center gap-1.5 text-xs tracking-wider text-brand-gold/70">
            <span>✨</span>
            <span>旎柏品牌</span>
          </div>
          <AnimatePresence mode="wait">
            <m.p
              key={factIndex}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.5 }}
              className="text-sm font-light leading-relaxed tracking-wide text-brand-charcoal/70"
            >
              {currentFact}
            </m.p>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

