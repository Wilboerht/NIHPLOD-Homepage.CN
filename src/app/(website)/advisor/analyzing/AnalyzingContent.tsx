"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { m, AnimatePresence } from "framer-motion";
import { Sparkles, Heart, Camera, FileText, RefreshCw, Users } from "lucide-react";
import { preprocessFaceImage } from "@/lib/image-processing";
import { useAdvisorAnalytics } from "@/hooks/useAdvisorAnalytics";

/** 失败类型 */
type FailureType = "face" | "questionnaire" | null;

/** 排队状态 */
interface QueueStatus {
  isQueuing: boolean;
  position: number;
  estimatedWaitSeconds: number;
}

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
  const { trackAnalysisStart } = useAdvisorAnalytics();
  const [progress, setProgress] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const [factIndex, setFactIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [failureType, setFailureType] = useState<FailureType>(null);
  const [medicalAdvice, setMedicalAdvice] = useState<string | null>(null);
  const [queueStatus, setQueueStatus] = useState<QueueStatus>({ isQueuing: false, position: 0, estimatedWaitSeconds: 0 });
  const hasStarted = useRef(false);

  /**
   * 执行分析
   * 问卷和扫脸数据缺一不可，任一失败都会阻止继续
   */
  /**
   * 执行分析
   * 问卷和扫脸数据缺一不可，任一失败都会阻止继续
   */
  const runAnalysis = useCallback(async () => {
    // 防抖与重复执行检查
    if (hasStarted.current) return;
    hasStarted.current = true;

    // 1. 检查缓存 (结果防抖)
    // 如果用户刚才跑过一次，刷新页面不应该重跑，而是直接用缓存结果
    try {
      const cachedResult = sessionStorage.getItem("advisorAnalysisResult");
      if (cachedResult) {
        const parsed = JSON.parse(cachedResult);
        // 简单验证缓存是否有效 (比如检查是否有 skinType)
        if (parsed && parsed.skinType) {
          console.log("Using cached analysis result");
          setProgress(100);
          setTimeout(() => {
            router.push(`/advisor/result?id=${parsed.reportId || "cached"}`);
          }, 800);
          return;
        }
      }
    } catch (e) {
      // 缓存解析失败，忽略，继续跑新的
      console.warn("Cache check failed", e);
    }

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

      // 图片预处理
      let imagesToAnalyze: { front?: string; left?: string; right?: string } = {};

      try {
        if (faceImagesStr) {
          // 有三张照片，全部使用
          const faceImages = JSON.parse(faceImagesStr);
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

        setProgress((prev) => Math.max(prev, 10)); // 图片处理完成
      } catch (e) {
        console.error("Image processing failed:", e);
        setFailureType("face");
        setError("照片处理失败，请重新拍摄");
        return;
      }

      // 尝试上传图片到 OSS (云加速)
      try {
        // 辅助函数：base64 转 blob
        const dataURLtoBlob = async (dataurl: string) => {
          const res = await fetch(dataurl);
          return await res.blob();
        };

        const uploadPromises: Promise<void>[] = [];
        // 为了类型安全，创建一个新的对象来存储可能的 URL
        const ossImages: typeof imagesToAnalyze = { ...imagesToAnalyze };
        let usedOSS = false;

        // 检查是否应该尝试上传 (可以加个配置开关，这里默认尝试)
        const tryUpload = async (key: keyof typeof imagesToAnalyze, base64Data?: string) => {
          if (!base64Data) return;
          try {
            const blob = await dataURLtoBlob(base64Data);
            // 动态导入上传工具，避免服务端渲染问题
            const { uploadImageToOSS } = await import("@/lib/oss-upload-client");
            const url = await uploadImageToOSS(blob, `face-${key}.jpg`);
            ossImages[key] = url;
            usedOSS = true;
          } catch (e) {
            console.warn(`Upload ${key} to OSS failed, fallback to base64`, e);
            // 失败则保留 base64，不抛出异常
          }
        };

        if (imagesToAnalyze.front) uploadPromises.push(tryUpload("front", imagesToAnalyze.front));
        if (imagesToAnalyze.left) uploadPromises.push(tryUpload("left", imagesToAnalyze.left));
        if (imagesToAnalyze.right) uploadPromises.push(tryUpload("right", imagesToAnalyze.right));

        if (uploadPromises.length > 0) {
          await Promise.all(uploadPromises);
          if (usedOSS) {
            imagesToAnalyze = ossImages;
            console.log("Using OSS images for analysis");
          }
        }
      } catch (e) {
        console.warn("OSS upload process failed, fallback to base64", e);
      }

      // 调用统一分析 API (Single Unified Call)
      try {
        setProgress((prev) => Math.max(prev, 30)); // 开始分析

        // 先检查队列状态
        try {
          const queueRes = await fetch("/api/advisor/queue-status");
          const queueData = await queueRes.json();
          if (queueData.success && queueData.data.isBusy) {
            setQueueStatus({
              isQueuing: true,
              position: queueData.data.queueLength + 1,
              estimatedWaitSeconds: queueData.data.estimatedWaitSeconds,
            });
          }
        } catch {
          // 队列状态检查失败不影响主流程
        }

        const res = await fetch("/api/advisor/comprehensive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answers,
            images: imagesToAnalyze,
          }),
        });

        // 请求完成，清除排队状态
        setQueueStatus({ isQueuing: false, position: 0, estimatedWaitSeconds: 0 });

        // 模拟更快的进度，因为是并行/统一处理
        setProgress((prev) => Math.max(prev, 60));

        const data = await res.json();

        if (!res.ok || !data.success) {
          // 区分错误类型
          if (data.error?.code === "VALIDATION_ERROR" || data.error?.code === "NO_IMAGES") {
            setFailureType("face");
            setError(data.error?.message || "照片验证失败");
          } else if (data.error?.code === "RATE_LIMIT_EXCEEDED") {
            setFailureType(null);
            setError("分析请求过于频繁，请稍后再试");
          } else {
            setFailureType("questionnaire"); // 归类为综合失败
            setError(data.error?.message || "深度分析服务繁忙，请重试");
          }
          return;
        }

        // 分析成功！
        const { faceAnalysis, comprehensiveResult } = data.data;

        // 检查面部分析中的特殊状态 (如 medical_condition)
        if (faceAnalysis?.validation?.status === "medical_condition") {
          setMedicalAdvice(faceAnalysis.validation.message);
          return;
        }

        // 保存面部分析结果
        if (faceAnalysis) {
          sessionStorage.setItem("advisorFaceAnalysis", JSON.stringify(faceAnalysis));
        }

        // 保存综合分析结果 (用于页面刷新缓存)
        if (comprehensiveResult) {
          sessionStorage.setItem("advisorAnalysisResult", JSON.stringify(comprehensiveResult));
        }

        // Transform and save comprehensive result
        // ResultContent.tsx expects: { skinAnalysis: {skinType, skinTypeLabel, summary, details, ...}, products: [...], routine: {...}, source: "ai" }
        if (comprehensiveResult) {
          const transformedResult = {
            skinAnalysis: {
              skinType: comprehensiveResult.skinType || "combination",
              skinTypeLabel: comprehensiveResult.skinType || "混合性肌肤", // Will be localized on result page if needed
              summary: comprehensiveResult.summary || "",
              details: comprehensiveResult.details || [],
              concerns: comprehensiveResult.concerns || [],
            },
            products: [], // Unified API doesn't return products directly yet, rely on faceAnalysis recommendations or fetch separately
            routine: {
              morning: [
                { order: 1, step: "洁面", description: "云朵洁面慕斯温和清洁" },
                { order: 2, step: "精华", description: "修护紧致精华按压吸收" },
                { order: 3, step: "面霜", description: "逆龄面霜滋润保湿" },
                { order: 4, step: "防晒", description: "轻透防晒霜日间防护" },
              ],
              evening: [
                { order: 1, step: "洁面", description: "云朵洁面慕斯深层清洁" },
                { order: 2, step: "精华", description: "修护紧致精华夜间修护" },
                { order: 3, step: "面霜", description: "逆龄面霜夜间滋养" },
              ],
            },
            source: "ai",
          };
          sessionStorage.setItem("advisorResult", JSON.stringify(transformedResult));
        }

        // 保存位置信息 (统一 API 暂未返回 location，如需要可后续补充，暂略)
        // trackAnalysisComplete(data.data.source || "ai"); // Source field might differ

        setProgress(100);

        // 延迟跳转
        setTimeout(() => {
          router.push("/advisor/result");
        }, 500);

      } catch (e) {
        console.error("Unified analysis failed:", e);
        setFailureType("questionnaire");
        setError(e instanceof Error ? e.message : "分析服务连接失败，请检查网络");
      }

    } catch (e) {
      console.error("Analysis process error:", e);
      setError(e instanceof Error ? e.message : "分析流程异常，请重试");
    }
  }, [router, trackAnalysisStart]);

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
          className="w-full max-w-xs text-center sm:max-w-sm"
        >
          {/* 温和的图标 */}
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-rose-100 to-pink-50 sm:mb-6 sm:h-20 sm:w-20">
            <Heart className="h-8 w-8 text-rose-400 sm:h-10 sm:w-10" />
          </div>

          {/* 温馨提示标题 */}
          <h2 className="mb-3 text-lg font-medium text-brand-charcoal sm:mb-4 sm:text-xl">
            温馨提示
          </h2>

          {/* 就医建议内容 */}
          <div className="mb-6 rounded-2xl bg-gradient-to-br from-rose-50 to-pink-50 p-4 sm:mb-8 sm:p-6">
            <p className="text-sm leading-relaxed text-brand-charcoal/80 sm:text-base">
              {medicalAdvice}
            </p>
          </div>

          {/* 行动按钮 */}
          <button
            onClick={() => router.push("/advisor")}
            className="w-full rounded-full bg-brand-gold px-5 py-2.5 text-sm text-white transition-colors hover:bg-brand-gold/90 sm:px-6 sm:py-3"
          >
            我知道了
          </button>

          {/* 底部说明 */}
          <p className="mt-4 text-[10px] text-brand-charcoal/50 sm:mt-6 sm:text-xs">
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
          className="w-full max-w-xs text-center sm:max-w-sm"
        >
          {/* 错误图标 */}
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-red-100 to-orange-50 sm:mb-6 sm:h-20 sm:w-20">
            {failureType === "face" ? (
              <Camera className="h-8 w-8 text-red-400 sm:h-10 sm:w-10" />
            ) : failureType === "questionnaire" ? (
              <FileText className="h-8 w-8 text-orange-400 sm:h-10 sm:w-10" />
            ) : (
              <RefreshCw className="h-8 w-8 text-red-400 sm:h-10 sm:w-10" />
            )}
          </div>

          {/* 错误标题 */}
          <h2 className="mb-3 text-lg font-medium text-brand-charcoal sm:mb-4 sm:text-xl">
            {failureType === "face" ? "面部分析失败" :
              failureType === "questionnaire" ? "综合分析失败" : "分析失败"}
          </h2>

          {/* 错误信息 */}
          <div className="mb-6 rounded-2xl bg-gradient-to-br from-red-50 to-orange-50 p-4 sm:mb-8 sm:p-6">
            <p className="text-sm leading-relaxed text-brand-charcoal/80 sm:text-base">
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

      <div className="relative z-10 w-full max-w-xs text-center sm:max-w-sm">
        {/* 优雅的旋转动画 */}
        <div className="relative mx-auto mb-8 h-24 w-24 sm:mb-10 sm:h-28 sm:w-28" aria-hidden="true">
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
              className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-brand-gold/20 to-brand-champagne/30 shadow-luxury sm:h-14 sm:w-14"
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <Sparkles className="h-6 w-6 text-brand-gold sm:h-7 sm:w-7" />
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
        <div className="mb-6 h-8 sm:mb-8">
          <AnimatePresence mode="wait">
            {queueStatus.isQueuing ? (
              // 排队状态显示
              <m.div
                key="queue"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.4 }}
                className="flex flex-col items-center gap-1"
              >
                <div className="flex items-center gap-2 text-sm text-brand-gold">
                  <Users className="h-4 w-4" />
                  <span>当前排队中，您前面还有 {queueStatus.position} 位</span>
                </div>
                <span className="text-xs text-brand-charcoal/50">
                  预计等待约 {queueStatus.estimatedWaitSeconds} 秒
                </span>
              </m.div>
            ) : (
              // 正常提示文案
              <m.div
                key={tipIndex}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                className="flex items-center justify-center gap-2 text-sm font-light tracking-wide text-brand-charcoal sm:gap-2.5"
              >
                <span className="text-lg sm:text-xl">{currentTip.icon}</span>
                <span>{currentTip.text}</span>
              </m.div>
            )}
          </AnimatePresence>
        </div>

        {/* 优雅进度条 */}
        <div className="mb-8 sm:mb-10">
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
        <div className="rounded-2xl border border-brand-beige/40 bg-white/60 p-4 shadow-card backdrop-blur-sm sm:p-5">
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

