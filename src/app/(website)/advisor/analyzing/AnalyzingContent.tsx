"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { m, AnimatePresence } from "framer-motion";
import { Sparkles, Heart } from "lucide-react";
import { preprocessFaceImage } from "@/lib/image-processing";
import { useAdvisorAnalytics } from "@/hooks/useAdvisorAnalytics";

/** 加载提示文案 */
const LOADING_TIPS = [
  { icon: "🔬", text: "正在分析您的肌肤类型..." },
  { icon: "💧", text: "检测肌肤水分状态..." },
  { icon: "✨", text: "评估肤色均匀度..." },
  { icon: "🎯", text: "识别肌肤问题区域..." },
  { icon: "📊", text: "综合分析数据..." },
  { icon: "💡", text: "生成专属护肤方案..." },
];

/** 品牌小知识 */
const BRAND_FACTS = [
  "真脂质体技术 - 高效渗透，深层滋养",
  "源自法国的高端护肤科技",
  "逆转时光，焕发肌肤年轻活力",
  "多肽配方，激活肌肤自我修护",
  "植物精萃，温和呵护每寸肌肤",
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
  const [medicalAdvice, setMedicalAdvice] = useState<string | null>(null); // 就医建议（需要特殊温和展示）
  const hasStarted = useRef(false);

  /**
   * 执行分析
   */
  const runAnalysis = useCallback(async () => {
    // 追踪分析开始
    trackAnalysisStart();

    try {
      // 获取问答数据
      const answersStr = sessionStorage.getItem("advisorAnswers");
      if (!answersStr) {
        router.replace("/advisor");
        return;
      }

      const answers = JSON.parse(answersStr);

      // 获取面部图片（可选）- 优先使用三张照片，降级到单张
      const faceImagesStr = sessionStorage.getItem("advisorFaceImages");
      const faceImage = sessionStorage.getItem("advisorFaceImage");
      let faceAnalysis = null;

      // 如果有面部图片，先预处理再分析
      if (faceImagesStr || faceImage) {
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

          setProgress(20);

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
            // 其他验证失败（非人脸、翻拍、视频帧等）
            console.error("Face validation failed:", faceData.error);
            throw new Error(faceData.error.message || "照片验证失败，请重新拍摄");
          }
          // 其他错误（如 AI 服务不可用）可以忽略，继续用问卷分析

          setProgress(50);
        } catch (e) {
          console.warn("Face analysis failed:", e);
          // 如果是验证失败错误，需要抛出让用户重新拍照
          if (e instanceof Error && (
            e.message.includes("验证") ||
            e.message.includes("人脸") ||
            e.message.includes("照片") ||
            e.message.includes("动物") ||
            e.message.includes("屏幕") ||
            e.message.includes("翻拍") ||
            e.message.includes("视频")
          )) {
            throw e;
          }
          // 其他错误（网络问题等）不阻断流程
        }
      } else {
        setProgress(30);
      }

      // 调用综合分析 API
      const res = await fetch("/api/advisor/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers,
          faceAnalysis,
        }),
      });

      setProgress(80);

      if (!res.ok) {
        throw new Error("分析请求失败");
      }

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error?.message || "分析失败");
      }

      // 保存分析结果
      sessionStorage.setItem("advisorResult", JSON.stringify(data.data));

      // 追踪分析完成
      trackAnalysisComplete(data.data.source || "ai");

      setProgress(100);

      // 延迟跳转，让用户看到 100% 进度
      setTimeout(() => {
        router.push("/advisor/result");
      }, 500);
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
        return prev + Math.random() * 2;
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

  // 错误状态
  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <div className="text-center">
          <p className="text-red-500">{error}</p>
          <button
            onClick={() => {
              setError(null);
              hasStarted.current = false;
              setProgress(0);
              runAnalysis();
            }}
            className="mt-4 rounded-full bg-brand-gold px-6 py-2 text-white"
          >
            重试
          </button>
          <button
            onClick={() => router.push("/advisor")}
            className="mt-2 block w-full text-sm text-brand-charcoal/60"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  const currentTip = LOADING_TIPS[tipIndex];
  const currentFact = BRAND_FACTS[factIndex];

  return (
    <div
      className="flex h-screen flex-col items-center justify-center overflow-hidden px-4"
      role="status"
      aria-live="polite"
      aria-label="正在分析您的肌肤状况"
    >
      <div className="w-full max-w-sm text-center">
        {/* 旋转动画 */}
        <div className="relative mx-auto mb-8 h-24 w-24" aria-hidden="true">
          {/* 外圈旋转 */}
          <m.div
            className="absolute inset-0 rounded-full border-2 border-brand-gold/30"
            animate={{ rotate: 360 }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          />
          {/* 内圈反向旋转 */}
          <m.div
            className="absolute inset-2 rounded-full border-2 border-dashed border-brand-gold/50"
            animate={{ rotate: -360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          />
          {/* 中心图标 */}
          <div className="absolute inset-0 flex items-center justify-center">
            <m.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Sparkles className="h-10 w-10 text-brand-gold" />
            </m.div>
          </div>
          {/* 进度指示点 */}
          <m.div
            className="absolute -right-1 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-brand-gold"
            animate={{ rotate: 360 }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "-47px center" }}
          />
        </div>

        {/* 动态提示文案 */}
        <div className="mb-6 h-8">
          <AnimatePresence mode="wait">
            <m.div
              key={tipIndex}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="flex items-center justify-center gap-2 text-brand-charcoal"
            >
              <span className="text-xl">{currentTip.icon}</span>
              <span>{currentTip.text}</span>
            </m.div>
          </AnimatePresence>
        </div>

        {/* 进度条 */}
        <div className="mb-8">
          <div
            className="mb-2 h-2 overflow-hidden rounded-full bg-brand-beige"
            role="progressbar"
            aria-valuenow={Math.round(Math.min(progress, 100))}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="分析进度"
          >
            <m.div
              className="h-full rounded-full bg-gradient-to-r from-brand-gold to-brand-gold/80"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(progress, 100)}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <span className="text-sm text-brand-charcoal/60" aria-hidden="true">
            {Math.round(Math.min(progress, 100))}%
          </span>
        </div>

        {/* 品牌小知识 */}
        <div className="rounded-xl bg-brand-cream/50 p-4">
          <div className="mb-1 text-xs text-brand-charcoal/50">💡 了解更多</div>
          <AnimatePresence mode="wait">
            <m.p
              key={factIndex}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="text-sm text-brand-charcoal/70"
            >
              {currentFact}
            </m.p>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

