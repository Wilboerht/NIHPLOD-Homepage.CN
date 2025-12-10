"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { m, AnimatePresence } from "framer-motion";
import {
  RefreshCw,
  Sparkles,
  Sun,
  Moon,
  ShoppingBag,
  Loader2,
  Share2,
  Check,
  Home,
  Star,
  Download,
  X,
  Copy,
  MessageCircle,
  AlertCircle,
} from "lucide-react";
import { FaceAnalysisResult } from "@/components/website/advisor/FaceAnalysisResult";
import { useAdvisorAnalytics } from "@/hooks/useAdvisorAnalytics";
import { fadeInUp, staggerContainer, defaultTransition } from "@/lib/animations";
import type { FaceAnalysisResult as FaceAnalysisData } from "@/app/api/advisor/face-analyze/route";
import {
  elementToImage,
  downloadImage,
  saveToGallery,
  copyToClipboard,
  generateShareUrl,
  shareToWeibo,
  generateShareText,
} from "@/lib/share";

/** 产品类型 */
interface Product {
  id: string;
  name: string;
  nameEn?: string | null;
  category?: string;
  reason: string;
  priority?: number;
  image?: string;
  description?: string | null;
}

/** 护肤步骤类型 */
interface RoutineStep {
  order: number;
  step: string;
  description: string;
  productId?: string;
  productName?: string;
}

/** 综合分析结果类型 */
interface ComprehensiveResult {
  skinProfile: {
    type: string;
    typeLabel: string;
    concerns: string[];
    skinAge?: number;
  };
  analysis: {
    summary: string;
    details: string[];
  };
  products: Product[];
  routine: {
    morning: RoutineStep[];
    evening: RoutineStep[];
  };
  dataSource: "comprehensive" | "questionnaire";
}

/**
 * 结果页面内容
 */
export function ResultContent() {
  const router = useRouter();
  const { trackResultView, trackResultShare } = useAdvisorAnalytics();
  const reportRef = useRef<HTMLDivElement>(null);
  const hasTrackedView = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ComprehensiveResult | null>(null);
  const [faceAnalysis, setFaceAnalysis] = useState<FaceAnalysisData | null>(null);
  const [userImage, setUserImage] = useState<string | null>(null);
  const [activeRoutine, setActiveRoutine] = useState<"morning" | "evening">("morning");
  const [shareStatus, setShareStatus] = useState<"idle" | "copying" | "copied">("idle");
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [isMobile, setIsMobile] = useState(true); // 默认移动端，避免闪烁

  // 检测是否支持原生分享和屏幕尺寸
  useEffect(() => {
    setCanNativeShare(typeof navigator !== "undefined" && !!navigator.share);

    // 检测是否为移动端
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // 追踪结果页面查看
  useEffect(() => {
    if (!loading && result && !hasTrackedView.current) {
      trackResultView();
      hasTrackedView.current = true;
    }
  }, [loading, result, trackResultView]);

  /**
   * 生成报告图片
   */
  const generateReportImage = useCallback(async (): Promise<string | null> => {
    if (!reportRef.current) return null;

    try {
      setIsGeneratingImage(true);
      const dataUrl = await elementToImage(reportRef.current, {
        scale: 2,
        backgroundColor: "#FAF8F5",
        padding: 24,
      });
      return dataUrl;
    } catch (error) {
      console.error("Failed to generate image:", error);
      return null;
    } finally {
      setIsGeneratingImage(false);
    }
  }, []);

  /**
   * 保存图片到本地
   */
  const handleSaveImage = useCallback(async () => {
    const imageUrl = await generateReportImage();
    if (imageUrl) {
      const timestamp = new Date().toISOString().slice(0, 10);
      downloadImage(imageUrl, `nihplod-skin-report-${timestamp}.png`);
      trackResultShare("image");
    }
    setShowShareMenu(false);
  }, [generateReportImage, trackResultShare]);

  /**
   * 保存到相册（移动端）
   */
  const handleSaveToGallery = useCallback(async () => {
    const imageUrl = await generateReportImage();
    if (imageUrl) {
      await saveToGallery(imageUrl);
      trackResultShare("image");
    }
    setShowShareMenu(false);
  }, [generateReportImage, trackResultShare]);

  /**
   * 复制分享链接
   */
  const handleCopyLink = useCallback(async () => {
    if (!result) return;

    const shareUrl = generateShareUrl("/advisor", {
      ref: "share",
    });

    const { title, description } = generateShareText(
      result.skinProfile.typeLabel,
      result.skinProfile.concerns
    );

    const text = `${title}\n${description}\n\n${shareUrl}`;

    const success = await copyToClipboard(text);
    if (success) {
      setShareStatus("copied");
      setTimeout(() => setShareStatus("idle"), 2000);
      trackResultShare("link");
    }
    setShowShareMenu(false);
  }, [result, trackResultShare]);

  /**
   * 分享到微博
   */
  const handleShareWeibo = useCallback(() => {
    if (!result) return;

    const shareUrl = generateShareUrl("/advisor", { ref: "weibo" });
    const { title, description } = generateShareText(
      result.skinProfile.typeLabel,
      result.skinProfile.concerns
    );

    shareToWeibo({
      title,
      description,
      url: shareUrl,
    });
    trackResultShare("weibo");
    setShowShareMenu(false);
  }, [result, trackResultShare]);

  /**
   * 原生分享（移动端）
   */
  const handleNativeShare = useCallback(async () => {
    if (!result || !navigator.share) return;

    const shareUrl = generateShareUrl("/advisor", { ref: "native" });
    const { title, description } = generateShareText(
      result.skinProfile.typeLabel,
      result.skinProfile.concerns
    );

    try {
      await navigator.share({
        title,
        text: description,
        url: shareUrl,
      });
      trackResultShare("native");
    } catch {
      // 用户取消
    }
    setShowShareMenu(false);
  }, [result, trackResultShare]);

  /**
   * 打开分享菜单
   */
  const handleShare = () => {
    setShowShareMenu(true);
  };

  /**
   * 加载分析数据
   */
  const loadAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // 获取问答数据
      const answersStr = sessionStorage.getItem("advisorAnswers");
      if (!answersStr) {
        router.replace("/advisor");
        return;
      }

      // 获取面部图片（可选）
      const faceImage = sessionStorage.getItem("advisorFaceImage");
      if (faceImage) {
        setUserImage(faceImage);
      }

      // 获取面部分析结果（可选）
      const faceAnalysisStr = sessionStorage.getItem("advisorFaceAnalysis");
      if (faceAnalysisStr) {
        try {
          setFaceAnalysis(JSON.parse(faceAnalysisStr));
        } catch {
          // 解析失败忽略
        }
      }

      // 获取已保存的分析结果
      const resultStr = sessionStorage.getItem("advisorResult");
      if (resultStr) {
        try {
          const savedResult = JSON.parse(resultStr);
          // 转换为综合结果格式
          setResult({
            skinProfile: {
              type: savedResult.skinAnalysis?.skinType || "combination",
              typeLabel: savedResult.skinAnalysis?.skinTypeLabel || "混合性肌肤",
              concerns: savedResult.skinAnalysis?.concerns || [],
              skinAge: savedResult.skinAnalysis?.skinAge,
            },
            analysis: {
              summary: savedResult.skinAnalysis?.summary || "根据您的问卷回答进行分析",
              details: savedResult.skinAnalysis?.details || [],
            },
            products: savedResult.products || [],
            routine: savedResult.routine || {
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
            dataSource: savedResult.source === "ai" ? "comprehensive" : "questionnaire",
          });
          setLoading(false);
          return;
        } catch {
          // 解析失败，重新请求
        }
      }

      // 没有保存的结果，重定向到分析页
      router.replace("/advisor/analyzing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败，请重试");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadAnalysis();
  }, [loadAnalysis]);

  /**
   * 重新分析
   */
  const handleRetry = () => {
    loadAnalysis();
  };

  /**
   * 重新开始
   */
  const handleRestart = () => {
    sessionStorage.removeItem("advisorAnswers");
    sessionStorage.removeItem("advisorFaceImage");
    router.push("/advisor");
  };

  // 加载中状态
  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <div className="text-center">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-brand-gold" />
          <p className="mt-4 text-brand-charcoal/60">正在分析您的肌肤...</p>
        </div>
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
            onClick={handleRetry}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand-gold px-6 py-2 text-white"
          >
            <RefreshCw className="h-4 w-4" />
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="min-h-screen px-4 py-6 md:px-6 lg:px-12 lg:py-8 xl:px-16">
      {/* 顶部导航 */}
      <header className="mx-auto mb-6 flex max-w-2xl items-center justify-between lg:max-w-3xl lg:mb-8">
        <Link
          href="/"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-brand-charcoal/20 bg-white/60 text-brand-charcoal/70 transition-all hover:border-brand-charcoal/40 hover:bg-white/80 hover:text-brand-charcoal lg:h-11 lg:w-11"
        >
          <Home className="h-5 w-5 lg:h-[22px] lg:w-[22px]" />
        </Link>
        <span className="text-xs font-light tracking-wider text-brand-charcoal/50 sm:text-sm">
          {result.dataSource === "comprehensive" ? "综合分析" : "问卷分析"}
        </span>
        <button
          onClick={handleShare}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-brand-charcoal/20 bg-white/60 text-brand-charcoal/70 transition-all hover:border-brand-charcoal/40 hover:bg-white/80 hover:text-brand-charcoal lg:h-11 lg:w-11"
          aria-label="分享"
        >
          <AnimatePresence mode="wait">
            {shareStatus === "copied" ? (
              <m.div
                key="check"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
              >
                <Check className="h-5 w-5 text-green-500" />
              </m.div>
            ) : (
              <m.div
                key="share"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
              >
                <Share2 className="h-5 w-5" />
              </m.div>
            )}
          </AnimatePresence>
        </button>
      </header>

      {/* 分享菜单弹窗 - 移动端底部抽屉，PC端居中弹窗 */}
      <AnimatePresence>
        {showShareMenu && (
          <>
            {/* 遮罩 */}
            <m.div
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowShareMenu(false)}
            />
            {/* 弹窗容器 - PC端居中，移动端底部 */}
            <m.div
              className={isMobile
                ? "fixed bottom-0 left-0 right-0 z-50 w-full"
                : "fixed left-1/2 top-1/2 z-50 w-[420px]"
              }
              initial={isMobile
                ? { y: "100%" }
                : { opacity: 0, scale: 0.95, x: "-50%", y: "-50%" }
              }
              animate={isMobile
                ? { y: 0 }
                : { opacity: 1, scale: 1, x: "-50%", y: "-50%" }
              }
              exit={isMobile
                ? { y: "100%" }
                : { opacity: 0, scale: 0.95, x: "-50%", y: "-50%" }
              }
              transition={isMobile
                ? { type: "spring", damping: 28, stiffness: 350 }
                : { duration: 0.2, ease: "easeOut" }
              }
            >
              <div className={`bg-[#EBE8DB] px-6 ${isMobile ? "rounded-t-[2rem] pb-10 pt-5" : "rounded-2xl pb-6 pt-5 shadow-2xl"}`}>
                {/* 顶部拖动指示条 - 仅移动端显示 */}
                {isMobile && <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-brand-charcoal/20" />}

                {/* 标题区域 */}
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h3 className="font-serif text-lg text-brand-charcoal">分享报告</h3>
                    <p className="mt-0.5 text-xs text-brand-charcoal/50">将您的肌肤分析报告分享给朋友</p>
                  </div>
                  <button
                    onClick={() => setShowShareMenu(false)}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/60 text-brand-charcoal/60 transition-colors hover:bg-white hover:text-brand-charcoal"
                    aria-label="关闭"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* 分享选项 */}
                <div className="grid grid-cols-4 gap-x-4 gap-y-5">
                  {/* 保存图片 */}
                  <button
                    onClick={handleSaveImage}
                    disabled={isGeneratingImage}
                    className="group flex flex-col items-center gap-2"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm transition-all group-hover:shadow-md group-active:scale-95">
                      {isGeneratingImage ? (
                        <Loader2 className="h-6 w-6 animate-spin text-brand-gold" />
                      ) : (
                        <Download className="h-6 w-6 text-brand-gold" />
                      )}
                    </div>
                    <span className="text-xs text-brand-charcoal/70">保存图片</span>
                  </button>

                  {/* 复制链接 */}
                  <button onClick={handleCopyLink} className="group flex flex-col items-center gap-2">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm transition-all group-hover:shadow-md group-active:scale-95">
                      <Copy className="h-6 w-6 text-blue-500" />
                    </div>
                    <span className="text-xs text-brand-charcoal/70">复制链接</span>
                  </button>

                  {/* 微信 */}
                  <button onClick={handleCopyLink} className="group flex flex-col items-center gap-2">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#07C160] shadow-sm transition-all group-hover:shadow-md group-active:scale-95">
                      <svg className="h-7 w-7 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088v-.001c-.135-.007-.27-.023-.407-.033zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/>
                      </svg>
                    </div>
                    <span className="text-xs text-brand-charcoal/70">微信</span>
                  </button>

                  {/* 微博 */}
                  <button onClick={handleShareWeibo} className="group flex flex-col items-center gap-2">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E6162D] shadow-sm transition-all group-hover:shadow-md group-active:scale-95">
                      <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M10.098 20c-4.433 0-8.098-2.055-8.098-4.786 0-1.413.887-3.016 2.396-4.383C6.535 9.06 9.263 8 11.667 8c1.65 0 2.94.377 3.727 1.088.66.597.96 1.353.894 2.249-.123 1.673-1.678 3.461-4.038 4.642-1.028.515-2.124.775-3.254.775-1.055 0-1.829-.276-2.236-.8-.27-.347-.362-.77-.266-1.222.107-.499.4-.94.758-1.248a2.93 2.93 0 0 1 1.79-.668c.482 0 .893.144 1.187.416.255.236.383.532.383.88 0 .348-.128.644-.37.857a1.03 1.03 0 0 1-.685.262c-.244 0-.456-.085-.614-.246a.605.605 0 0 1-.173-.433c0-.123.035-.237.102-.331.063-.088.15-.16.253-.21l-.016-.03c-.193.078-.355.2-.47.356a.87.87 0 0 0-.152.503c0 .23.093.44.27.608.19.181.453.28.761.28.374 0 .728-.137 1.002-.388.298-.273.463-.638.463-1.03 0-.474-.175-.903-.508-1.24-.373-.38-.923-.59-1.549-.59-.729 0-1.418.263-1.94.74a2.69 2.69 0 0 0-.905 1.958c-.044.452.08.87.36 1.209.507.617 1.446.954 2.717.954 1.185 0 2.374-.302 3.44-.873 2.07-1.109 3.428-2.663 3.522-4.035.043-.622-.169-1.17-.63-1.63C14.09 8.282 13.003 8 11.667 8c-2.219 0-4.762.98-6.782 2.618C3.453 11.823 2.5 13.395 2.5 15c0 2.321 3.31 4.286 7.598 4.286 3.506 0 6.64-1.485 8.148-3.858a.625.625 0 0 0-.207-.86.625.625 0 0 0-.86.207C15.833 17.145 13.11 18.5 10 18.5c-.035 0-.07-.001-.104-.003C13.392 17.85 16 15.607 16 13c0-.19-.015-.377-.044-.562.853-.157 1.57-.626 2.017-1.322a.625.625 0 1 0-1.054-.673 1.747 1.747 0 0 1-1.288.839c-.23-.59-.608-1.108-1.123-1.52-.906-.727-2.17-1.097-3.758-1.097-2.57 0-5.421 1.106-7.685 2.98C1.47 13.048.5 14.889.5 16.714c0 3.233 4.132 5.786 9.098 5.786 5.065 0 8.902-2.554 8.902-5.5 0-.69-.19-1.355-.548-1.98a.625.625 0 0 0-1.073.643c.27.474.414.977.414 1.337 0 2.34-3.422 4.214-7.695 4.214-4.173 0-7.89-1.873-7.89-4.5 0-1.537.87-3.127 2.382-4.352C6.38 10.197 8.96 9.214 11.37 9.214c1.386 0 2.45.3 3.165.89.558.46.809 1.031.758 1.697-.09 1.184-1.267 2.633-3.23 3.621-.917.462-1.907.696-2.94.696-.868 0-1.54-.22-1.943-.637-.235-.245-.33-.52-.282-.82.048-.297.21-.564.443-.756a1.718 1.718 0 0 1 1.066-.407c.299 0 .55.085.725.246a.68.68 0 0 1 .222.51.68.68 0 0 1-.222.51c-.18.166-.438.252-.749.252a.625.625 0 0 0 0 1.25c.56 0 1.075-.165 1.487-.477a1.93 1.93 0 0 0 .733-1.535c0-.62-.248-1.188-.7-1.599-.492-.449-1.17-.687-1.959-.687a2.97 2.97 0 0 0-1.84.654 2.65 2.65 0 0 0-.88 1.514c-.105.558.06 1.088.478 1.533.597.636 1.545.987 2.667.987 1.143 0 2.24-.262 3.264-.778 2.206-1.11 3.582-2.792 3.693-4.274.066-.78-.212-1.506-.828-2.158-.825-.873-2.067-1.335-3.59-1.335z"/>
                      </svg>
                    </div>
                    <span className="text-xs text-brand-charcoal/70">微博</span>
                  </button>

                  {/* 小红书 */}
                  <button onClick={handleCopyLink} className="group flex flex-col items-center gap-2">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FE2C55] shadow-sm transition-all group-hover:shadow-md group-active:scale-95">
                      <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12.006 2c2.756 0 4.996 2.24 4.996 4.996v.008h2.004a2 2 0 0 1 2 2v10.998a2 2 0 0 1-2 2H4.994a2 2 0 0 1-2-2V9.004a2 2 0 0 1 2-2h2.004v-.008C6.998 4.24 9.238 2 12.006 2zm0 1.5c-1.928 0-3.496 1.568-3.496 3.496v.008h6.992v-.008c0-1.928-1.568-3.496-3.496-3.496zM8.75 12.5a.75.75 0 0 0-.75.75v3.5a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75zm6.5 0a.75.75 0 0 0-.75.75v3.5a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75zm-3.25 0a.75.75 0 0 0-.75.75v3.5a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75z"/>
                      </svg>
                    </div>
                    <span className="text-xs text-brand-charcoal/70">小红书</span>
                  </button>

                  {/* 抖音 */}
                  <button onClick={handleCopyLink} className="group flex flex-col items-center gap-2">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black shadow-sm transition-all group-hover:shadow-md group-active:scale-95">
                      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none">
                        <path d="M19.321 5.562a5.124 5.124 0 0 1-.443-.258 6.228 6.228 0 0 1-1.137-.966c-.849-.971-1.166-1.956-1.282-2.645h.004c-.097-.573-.057-.943-.05-.943h-3.865v14.943c0 .2 0 .399-.008.595 0 .024-.003.046-.004.073 0 .01 0 .022-.002.032v.009a3.28 3.28 0 0 1-1.65 2.604 3.226 3.226 0 0 1-1.6.422c-1.8 0-3.26-1.468-3.26-3.281s1.46-3.282 3.26-3.282c.341 0 .68.054 1.004.16l.005-3.936a7.178 7.178 0 0 0-4.937 1.166 7.333 7.333 0 0 0-2.325 2.564 7.448 7.448 0 0 0-.748 1.906 7.655 7.655 0 0 0-.085 3.063c.149.853.424 1.651.812 2.382a7.363 7.363 0 0 0 2.926 2.986 7.206 7.206 0 0 0 3.753 1.054c.39 0 .789-.033 1.188-.1a7.263 7.263 0 0 0 2.911-1.103 7.364 7.364 0 0 0 2.447-2.653c.443-.786.725-1.648.843-2.562.018-.134.032-.269.045-.404v-.024l.003-9.882a9.27 9.27 0 0 0 2.273 1.2 9.556 9.556 0 0 0 2.474.53V5.742c-.497 0-1.246-.136-2.088-.48l-.005.002z" fill="#25F4EE"/>
                        <path d="M17.233 5.082a5.124 5.124 0 0 1-.443-.258 6.228 6.228 0 0 1-1.137-.966c-.849-.971-1.166-1.956-1.282-2.645h.004c-.097-.573-.057-.943-.05-.943H10.46v14.943c0 .2 0 .399-.008.595 0 .024-.003.046-.004.073 0 .01 0 .022-.002.032v.009a3.28 3.28 0 0 1-1.65 2.604 3.226 3.226 0 0 1-1.6.422c-1.8 0-3.26-1.468-3.26-3.281s1.46-3.282 3.26-3.282c.341 0 .68.054 1.004.16l.005-3.936a7.178 7.178 0 0 0-4.937 1.166A7.333 7.333 0 0 0 .943 12.34a7.448 7.448 0 0 0-.748 1.906 7.655 7.655 0 0 0-.085 3.063c.149.853.424 1.651.812 2.382a7.363 7.363 0 0 0 2.926 2.986 7.206 7.206 0 0 0 3.753 1.054c.39 0 .789-.033 1.188-.1a7.263 7.263 0 0 0 2.911-1.103 7.364 7.364 0 0 0 2.447-2.653c.443-.786.725-1.648.843-2.562.018-.134.032-.269.045-.404v-.024l.003-9.882a9.27 9.27 0 0 0 2.273 1.2 9.556 9.556 0 0 0 2.474.53V5.262c-.497 0-1.246-.136-2.088-.48l-.005.002z" fill="#FE2C55"/>
                      </svg>
                    </div>
                    <span className="text-xs text-brand-charcoal/70">抖音</span>
                  </button>

                  {/* 更多（原生分享）- 仅移动端显示 */}
                  {canNativeShare && isMobile && (
                    <button onClick={handleNativeShare} className="group flex flex-col items-center gap-2">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm transition-all group-hover:shadow-md group-active:scale-95">
                        <Share2 className="h-6 w-6 text-brand-charcoal/70" />
                      </div>
                      <span className="text-xs text-brand-charcoal/70">更多</span>
                    </button>
                  )}
                </div>

                {/* 保存报告图片按钮 */}
                <button
                  onClick={handleSaveToGallery}
                  disabled={isGeneratingImage}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-brand-gold py-3.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-gold/90 active:scale-[0.98] disabled:opacity-50"
                >
                  {isGeneratingImage ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      正在生成报告...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      保存报告图片到相册
                    </>
                  )}
                </button>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>

      {/* 页面标题 */}
      <m.div
        className="mb-6 text-center lg:mb-8"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-brand-gold/10 px-4 py-1.5">
          <Star className="h-4 w-4 text-brand-gold" />
          <span className="text-sm text-brand-gold">AI 分析完成</span>
        </div>
        <h1 className="font-serif text-2xl text-brand-charcoal lg:text-3xl">您的肌肤分析报告</h1>
      </m.div>

      {/* 报告内容区域（用于截图） */}
      <m.div
        ref={reportRef}
        className="mx-auto max-w-2xl space-y-6 lg:max-w-3xl"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        {/* 面部分析结果（如果有） */}
        {faceAnalysis && (
          <m.div variants={fadeInUp} transition={defaultTransition}>
            <FaceAnalysisResult result={faceAnalysis} userImage={userImage || undefined} />
          </m.div>
        )}

        {/* 综合分析摘要 */}
        <m.div
          variants={fadeInUp}
          transition={defaultTransition}
          className="rounded-2xl bg-white p-4 shadow-sm"
        >
          <h3 className="mb-3 flex items-center gap-2 font-medium text-brand-charcoal">
            <Sparkles className="h-5 w-5 text-brand-gold" />
            综合分析
          </h3>
          <p className="mb-3 text-sm text-brand-charcoal/80">{result.analysis.summary}</p>
          <ul className="space-y-1.5">
            {result.analysis.details.map((detail, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-brand-charcoal/70">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-gold" />
                {detail}
              </li>
            ))}
          </ul>
        </m.div>

        {/* 护肤方案 */}
        <m.div
          variants={fadeInUp}
          transition={defaultTransition}
          className="rounded-2xl bg-white p-4 shadow-sm"
        >
          <h3 className="mb-3 font-medium text-brand-charcoal">专属护肤方案</h3>

          {/* 切换标签 */}
          <div className="mb-4 flex gap-2">
            <button
              onClick={() => setActiveRoutine("morning")}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm transition-colors ${
                activeRoutine === "morning"
                  ? "bg-brand-gold text-white"
                  : "bg-brand-cream text-brand-charcoal/60"
              }`}
            >
              <Sun className="h-4 w-4" />
              晨间护肤
            </button>
            <button
              onClick={() => setActiveRoutine("evening")}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm transition-colors ${
                activeRoutine === "evening"
                  ? "bg-brand-gold text-white"
                  : "bg-brand-cream text-brand-charcoal/60"
              }`}
            >
              <Moon className="h-4 w-4" />
              夜间护肤
            </button>
          </div>

          {/* 步骤列表 */}
          <div className="space-y-3">
            {result.routine[activeRoutine].map((step) => {
              // 查找对应产品
              const product = step.productId
                ? result.products.find((p) => p.id === step.productId)
                : null;

              return (
                <div key={step.order} className="flex items-start gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-gold/10 text-sm font-medium text-brand-gold">
                    {step.order}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-brand-charcoal">{step.step}</span>
                      {(step.productName || product?.name) && (
                        <>
                          <span className="text-brand-charcoal/30">·</span>
                          {product ? (
                            <Link
                              href={`/products/${product.id}`}
                              className="text-sm text-brand-gold hover:underline"
                            >
                              {step.productName || product.name}
                            </Link>
                          ) : (
                            <span className="text-sm text-brand-gold">
                              {step.productName}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    <div className="text-xs text-brand-charcoal/60">{step.description}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </m.div>

        {/* 免责声明 */}
        <m.div
          variants={fadeInUp}
          transition={defaultTransition}
          className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-600" />
            <div className="text-xs leading-relaxed text-amber-800/80">
              <p className="mb-1 font-medium text-amber-900">温馨提示</p>
              <p>
                本分析报告由 AI
                技术生成，仅供护肤品选购参考，不构成医学诊断或治疗建议。
                {faceAnalysis && (
                  <span>
                    面部照片分析结果受拍摄光线、角度等因素影响，准确度有限。
                  </span>
                )}
                如有皮肤健康问题，请咨询专业皮肤科医生。
              </p>
            </div>
          </div>
        </m.div>

        {/* 操作按钮 */}
        <m.div
          variants={fadeInUp}
          transition={defaultTransition}
          className="flex flex-col gap-3 pt-4 sm:flex-row"
        >
          <button
            onClick={handleRestart}
            className="flex items-center justify-center gap-2 rounded-full border border-brand-charcoal/20 py-3 text-sm text-brand-charcoal transition-colors hover:bg-brand-cream sm:flex-1"
          >
            <RefreshCw className="h-4 w-4" />
            重新测试
          </button>
          <Link
            href="/products"
            className="flex items-center justify-center gap-2 rounded-full bg-brand-gold py-3 text-sm text-white transition-colors hover:bg-brand-gold/90 sm:flex-1"
          >
            <ShoppingBag className="h-4 w-4" />
            浏览全部产品
          </Link>
        </m.div>

        {/* 底部间距 */}
        <div className="h-8" />
      </m.div>
    </div>
  );
}

