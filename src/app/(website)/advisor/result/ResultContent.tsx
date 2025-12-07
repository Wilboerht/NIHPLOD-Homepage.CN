"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
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
    morning: { order: number; step: string; description: string }[];
    evening: { order: number; step: string; description: string }[];
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

  // 检测是否支持原生分享
  useEffect(() => {
    setCanNativeShare(typeof navigator !== "undefined" && !!navigator.share);
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
    <div className="min-h-screen px-4 py-6 md:px-6">
      {/* 顶部导航 */}
      <header className="mb-6 flex items-center justify-between">
        <Link
          href="/"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-brand-charcoal shadow-sm transition-colors hover:bg-white"
        >
          <Home className="h-5 w-5" />
        </Link>
        <span className="text-sm text-brand-charcoal/60">
          {result.dataSource === "comprehensive" ? "综合分析" : "问卷分析"}
        </span>
        <button
          onClick={handleShare}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-brand-charcoal shadow-sm transition-colors hover:bg-white"
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

      {/* 分享菜单弹窗 */}
      <AnimatePresence>
        {showShareMenu && (
          <>
            {/* 遮罩 */}
            <m.div
              className="fixed inset-0 z-50 bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowShareMenu(false)}
            />
            {/* 弹窗 */}
            <m.div
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl bg-white p-6 pb-8"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-medium text-brand-charcoal">分享报告</h3>
                <button
                  onClick={() => setShowShareMenu(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-brand-cream"
                  aria-label="关闭"
                >
                  <X className="h-5 w-5 text-brand-charcoal/60" />
                </button>
              </div>

              {/* 分享选项 */}
              <div className="grid grid-cols-4 gap-4">
                {/* 保存图片 */}
                <button
                  onClick={handleSaveImage}
                  disabled={isGeneratingImage}
                  className="flex flex-col items-center gap-2"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-gold to-brand-gold/80 text-white">
                    {isGeneratingImage ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                      <Download className="h-6 w-6" />
                    )}
                  </div>
                  <span className="text-xs text-brand-charcoal/70">保存图片</span>
                </button>

                {/* 复制链接 */}
                <button onClick={handleCopyLink} className="flex flex-col items-center gap-2">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                    <Copy className="h-6 w-6" />
                  </div>
                  <span className="text-xs text-brand-charcoal/70">复制链接</span>
                </button>

                {/* 微信 */}
                <button onClick={handleCopyLink} className="flex flex-col items-center gap-2">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-green-600 text-white">
                    <MessageCircle className="h-6 w-6" />
                  </div>
                  <span className="text-xs text-brand-charcoal/70">微信</span>
                </button>

                {/* 微博 */}
                <button onClick={handleShareWeibo} className="flex flex-col items-center gap-2">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-red-600 text-white">
                    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M10.098 20c-4.433 0-8.098-2.055-8.098-4.786 0-1.732 1.375-3.588 3.666-4.998 2.917-1.797 6.5-2.017 8.017-0.493 0.398 0.399 0.594 0.887 0.586 1.455-0.013 0.885-0.568 1.845-1.565 2.697-1.157 0.988-2.633 1.547-3.855 1.547-0.899 0-1.602-0.279-1.926-0.764-0.255-0.383-0.297-0.875-0.119-1.383 0.066-0.191 0.225-0.422 0.418-0.609 0.082-0.079 0.184-0.158 0.291-0.227-0.119 0.023-0.238 0.055-0.353 0.102-0.587 0.24-0.98 0.71-1.045 1.257-0.057 0.479 0.166 0.939 0.593 1.222 0.521 0.346 1.256 0.447 2.014 0.275 1.089-0.244 2.082-0.857 2.795-1.726 0.516-0.629 0.809-1.357 0.824-2.049 0.008-0.406-0.111-0.773-0.348-1.066-0.703-0.87-2.563-0.955-4.695-0.216-2.067 0.717-3.871 2.227-4.617 3.869-0.249 0.55-0.372 1.082-0.366 1.583 0.017 1.605 1.992 2.917 4.407 2.93 3.087 0.017 6.093-1.812 6.886-4.188 0.072-0.217 0.123-0.439 0.154-0.664 0.034 0.001 0.067 0.002 0.101 0.002 1.127 0 2.076-0.772 2.338-1.818 0.036 0.007 0.073 0.011 0.111 0.011 0.482 0 0.873-0.391 0.873-0.873s-0.391-0.873-0.873-0.873c-0.165 0-0.318 0.047-0.449 0.127-0.318-0.771-1.074-1.315-1.962-1.315-0.109 0-0.217 0.008-0.322 0.025 0.027-0.153 0.041-0.311 0.041-0.472 0-1.479-1.199-2.678-2.678-2.678-0.652 0-1.249 0.234-1.713 0.622-0.474-1.136-1.591-1.935-2.893-1.935-1.736 0-3.143 1.407-3.143 3.143 0 0.264 0.033 0.521 0.095 0.766-2.614 0.953-4.437 3.416-4.437 6.305 0 3.701 3.681 6.714 8.202 6.714 4.522 0 8.203-3.013 8.203-6.714 0-0.614-0.097-1.206-0.278-1.768-0.556 0.892-1.508 1.513-2.608 1.636 0.006 0.044 0.009 0.088 0.009 0.132 0 2.852-2.809 5.166-6.273 5.166z" />
                    </svg>
                  </div>
                  <span className="text-xs text-brand-charcoal/70">微博</span>
                </button>
              </div>

              {/* 移动端原生分享 */}
              {canNativeShare && (
                <button
                  onClick={handleNativeShare}
                  className="mt-4 w-full rounded-full border border-brand-charcoal/20 py-3 text-sm text-brand-charcoal transition-colors hover:bg-brand-cream"
                >
                  更多分享方式...
                </button>
              )}

              {/* 保存到相册（移动端） */}
              <button
                onClick={handleSaveToGallery}
                disabled={isGeneratingImage}
                className="mt-3 w-full rounded-full bg-brand-gold py-3 text-sm text-white transition-colors hover:bg-brand-gold/90 disabled:opacity-50"
              >
                {isGeneratingImage ? "正在生成..." : "保存报告图片到相册"}
              </button>
            </m.div>
          </>
        )}
      </AnimatePresence>

      {/* 页面标题 */}
      <m.div
        className="mb-6 text-center"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-brand-gold/10 px-4 py-1.5">
          <Star className="h-4 w-4 text-brand-gold" />
          <span className="text-sm text-brand-gold">AI 分析完成</span>
        </div>
        <h1 className="font-playfair text-2xl text-brand-charcoal">您的肌肤分析报告</h1>
      </m.div>

      {/* 报告内容区域（用于截图） */}
      <m.div
        ref={reportRef}
        className="mx-auto max-w-2xl space-y-6"
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
            {result.routine[activeRoutine].map((step) => (
              <div key={step.order} className="flex items-center gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-gold/10 text-sm font-medium text-brand-gold">
                  {step.order}
                </div>
                <div>
                  <div className="text-sm font-medium text-brand-charcoal">{step.step}</div>
                  <div className="text-xs text-brand-charcoal/60">{step.description}</div>
                </div>
              </div>
            ))}
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

        {/* 推荐产品 */}
        {result.products.length > 0 && (
          <m.div
            variants={fadeInUp}
            transition={defaultTransition}
            className="rounded-2xl bg-white p-4 shadow-sm"
          >
            <h3 className="mb-4 flex items-center gap-2 font-medium text-brand-charcoal">
              <ShoppingBag className="h-5 w-5 text-brand-gold" />
              💫 为您推荐以下产品
            </h3>

            {/* 产品卡片网格 */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {result.products.slice(0, 6).map((product, index) => (
                <m.div
                  key={product.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Link
                    href={`/products/${product.id}`}
                    className="group block overflow-hidden rounded-xl bg-brand-cream/50 transition-all hover:bg-brand-cream hover:shadow-md"
                  >
                    {/* 产品图片 */}
                    <div className="relative aspect-square overflow-hidden bg-white">
                      {product.image ? (
                        <Image
                          src={product.image}
                          alt={product.name}
                          fill
                          className="object-cover transition-transform duration-300 group-hover:scale-105"
                          sizes="(max-width: 768px) 50vw, 33vw"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <ShoppingBag className="h-8 w-8 text-brand-beige" />
                        </div>
                      )}
                    </div>
                    {/* 产品信息 */}
                    <div className="p-3">
                      <div className="mb-1 line-clamp-1 text-sm font-medium text-brand-charcoal">
                        {product.name}
                      </div>
                      {product.nameEn && (
                        <div className="mb-1 line-clamp-1 text-xs text-brand-charcoal/40">
                          {product.nameEn}
                        </div>
                      )}
                      <div className="line-clamp-2 text-xs text-brand-gold">{product.reason}</div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-brand-charcoal/50">
                          {product.category || "护肤品"}
                        </span>
                        <span className="text-xs text-brand-gold">查看详情 →</span>
                      </div>
                    </div>
                  </Link>
                </m.div>
              ))}
            </div>
          </m.div>
        )}

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

