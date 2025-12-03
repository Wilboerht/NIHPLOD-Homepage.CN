"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { m, AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";
import { preprocessFaceImage } from "@/lib/image-processing";

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
  "源自瑞士的高端护肤科技",
  "逆转时光，焕发肌肤年轻活力",
  "多肽配方，激活肌肤自我修护",
  "植物精萃，温和呵护每寸肌肤",
];

/**
 * 分析中页面内容
 */
export function AnalyzingContent() {
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const [factIndex, setFactIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const hasStarted = useRef(false);

  /**
   * 执行分析
   */
  const runAnalysis = useCallback(async () => {
    try {
      // 获取问答数据
      const answersStr = sessionStorage.getItem("advisorAnswers");
      if (!answersStr) {
        router.replace("/advisor");
        return;
      }

      const answers = JSON.parse(answersStr);

      // 获取面部图片（可选）
      const faceImage = sessionStorage.getItem("advisorFaceImage");
      let faceAnalysis = null;

      // 如果有面部图片，先预处理再分析
      if (faceImage) {
        try {
          // 预处理图片
          const processed = await preprocessFaceImage(faceImage);
          setProgress(20);

          // 调用面部分析 API
          const faceRes = await fetch("/api/advisor/face-analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: processed.imageData }),
          });

          if (faceRes.ok) {
            const faceData = await faceRes.json();
            if (faceData.success) {
              faceAnalysis = faceData.data;
              // 保存面部分析结果
              sessionStorage.setItem("advisorFaceAnalysis", JSON.stringify(faceData.data));
            }
          }
          setProgress(50);
        } catch (e) {
          console.warn("Face analysis failed:", e);
          // 面部分析失败不阻断流程
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

      setProgress(100);

      // 延迟跳转，让用户看到 100% 进度
      setTimeout(() => {
        router.push("/advisor/result");
      }, 500);
    } catch (e) {
      console.error("Analysis error:", e);
      setError(e instanceof Error ? e.message : "分析失败，请重试");
    }
  }, [router]);

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
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        {/* 旋转动画 */}
        <div className="relative mx-auto mb-8 h-24 w-24">
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
          <div className="mb-2 h-2 overflow-hidden rounded-full bg-brand-beige">
            <m.div
              className="h-full rounded-full bg-gradient-to-r from-brand-gold to-brand-gold/80"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(progress, 100)}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <span className="text-sm text-brand-charcoal/60">
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

