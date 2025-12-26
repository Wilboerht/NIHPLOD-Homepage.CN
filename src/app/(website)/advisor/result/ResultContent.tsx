"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Link } from "next-view-transitions";
import { m, AnimatePresence } from "framer-motion";
import {
  RefreshCw,
  Sparkles,
  ShoppingBag,
  Loader2,
  Share2,
  Check,
  Home,
  Star,
  Download,
  X,
  AlertCircle,
  ChevronRight,
} from "lucide-react";

// 自定义图标组件 - 与 ritual 页面一致
const ICON_COLOR = "#C3BC9F";

const SunIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M12 18.5C15.5898 18.5 18.5 15.5898 18.5 12C18.5 8.41015 15.5898 5.5 12 5.5C8.41015 5.5 5.5 8.41015 5.5 12C5.5 15.5898 8.41015 18.5 12 18.5Z" fill={ICON_COLOR} stroke={ICON_COLOR} strokeWidth="1.6" strokeLinejoin="round"/>
    <path d="M12 3C12.6904 3 13.25 2.44036 13.25 1.75C13.25 1.05964 12.6904 0.5 12 0.5C11.3097 0.5 10.75 1.05964 10.75 1.75C10.75 2.44036 11.3097 3 12 3Z" fill={ICON_COLOR}/>
    <path d="M19.25 6C19.9404 6 20.5 5.44035 20.5 4.75C20.5 4.05964 19.9404 3.5 19.25 3.5C18.5597 3.5 18 4.05964 18 4.75C18 5.44035 18.5597 6 19.25 6Z" fill={ICON_COLOR}/>
    <path d="M22.25 13.25C22.9404 13.25 23.5 12.6904 23.5 12C23.5 11.3097 22.9404 10.75 22.25 10.75C21.5597 10.75 21 11.3097 21 12C21 12.6904 21.5597 13.25 22.25 13.25Z" fill={ICON_COLOR}/>
    <path d="M19.25 20.5C19.9404 20.5 20.5 19.9404 20.5 19.25C20.5 18.5597 19.9404 18 19.25 18C18.5597 18 18 18.5597 18 19.25C18 19.9404 18.5597 20.5 19.25 20.5Z" fill={ICON_COLOR}/>
    <path d="M12 23.5C12.6904 23.5 13.25 22.9404 13.25 22.25C13.25 21.5597 12.6904 21 12 21C11.3097 21 10.75 21.5597 10.75 22.25C10.75 22.9404 11.3097 23.5 12 23.5Z" fill={ICON_COLOR}/>
    <path d="M4.75 20.5C5.44035 20.5 6 19.9404 6 19.25C6 18.5597 5.44035 18 4.75 18C4.05964 18 3.5 18.5597 3.5 19.25C3.5 19.9404 4.05964 20.5 4.75 20.5Z" fill={ICON_COLOR}/>
    <path d="M1.75 13.25C2.44036 13.25 3 12.6904 3 12C3 11.3097 2.44036 10.75 1.75 10.75C1.05964 10.75 0.5 11.3097 0.5 12C0.5 12.6904 1.05964 13.25 1.75 13.25Z" fill={ICON_COLOR}/>
    <path d="M4.75 6C5.44035 6 6 5.44035 6 4.75C6 4.05964 5.44035 3.5 4.75 3.5C4.05964 3.5 3.5 4.05964 3.5 4.75C3.5 5.44035 4.05964 6 4.75 6Z" fill={ICON_COLOR}/>
  </svg>
);

const MoonIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M13.8237 3.18488C11.3623 3.82663 9.54547 6.06477 9.54547 8.72728C9.54547 11.8904 12.1096 14.4545 15.2727 14.4545C17.9352 14.4545 20.1734 12.6377 20.8151 10.1763C20.9363 10.7652 21 11.3752 21 12C21 16.9706 16.9706 21 12 21C7.02943 21 3 16.9706 3 12C3 7.02943 7.02943 3 12 3C12.6248 3 13.2348 3.06367 13.8237 3.18488Z" fill={ICON_COLOR} stroke={ICON_COLOR} strokeWidth="1.44" strokeLinejoin="round"/>
  </svg>
);

const HeartIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M7.49983 4.00195C4.46222 4.00195 1.99976 6.46443 1.99976 9.50202C1.99976 15.0021 8.49984 20.0022 11.9999 21.1653C15.4999 20.0022 22 15.0021 22 9.50202C22 6.46443 19.5375 4.00195 16.4999 4.00195C14.6398 4.00195 12.9952 4.92542 11.9999 6.33888C11.0045 4.92542 9.36 4.00195 7.49983 4.00195Z" fill={ICON_COLOR} stroke={ICON_COLOR} strokeWidth="1.60002" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const TravelIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M21 16V14L13 9V3.5C13 2.67 12.33 2 11.5 2C10.67 2 10 2.67 10 3.5V9L2 14V16L10 13.5V19L8 20.5V22L11.5 21L15 22V20.5L13 19V13.5L21 16Z" fill={ICON_COLOR} stroke={ICON_COLOR} strokeWidth="0.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
import { FaceAnalysisResult, AdvisorChatPanel } from "@/components/website/advisor";
import { useAdvisorAnalytics } from "@/hooks/useAdvisorAnalytics";
import { fadeInUp, staggerContainer, defaultTransition } from "@/lib/animations";
import type { FaceAnalysisResult as FaceAnalysisData } from "@/app/api/advisor/face-analyze/route";
import {
  saveToGallery,
  copyToClipboard,
  generateShareUrl,
  shareToWeibo,
  generateShareText,
} from "@/lib/share";
import { ShareFloatingButton, ShareIcons, type ShareOption } from "@/components/ui/ShareFloatingButton";
import { useToast } from "@/components/ui/Toast";


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
  const toast = useToast();
  const { trackResultView, trackResultShare } = useAdvisorAnalytics();
  const reportRef = useRef<HTMLDivElement>(null);
  const hasTrackedView = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ComprehensiveResult | null>(null);
  const [faceAnalysis, setFaceAnalysis] = useState<FaceAnalysisData | null>(null);
  const [userImage, setUserImage] = useState<string | null>(null);

  const [shareStatus, setShareStatus] = useState<"idle" | "copying" | "copied">("idle");
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [isMobile, setIsMobile] = useState(true); // 默认移动端，避免闪烁
  const [routineModal, setRoutineModal] = useState<"morning" | "evening" | "family" | "travel" | null>(null);
  const [mounted, setMounted] = useState(false);

  // 用于 Portal 渲染
  useEffect(() => {
    setMounted(true);
  }, []);

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
   * 使用服务端 Satori API 生成固定布局的报告图片
   */
  const generateReportImage = useCallback(async (): Promise<string | null> => {
    if (!result) return null;

    try {
      setIsGeneratingImage(true);

      // 调用服务端 API 生成图片
      const response = await fetch("/api/advisor/share-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          skinType: result.skinProfile.type,
          skinTypeLabel: result.skinProfile.typeLabel,
          concerns: result.skinProfile.concerns,
          skinAge: result.skinProfile.skinAge,
          summary: result.analysis.summary,
          details: result.analysis.details,
          faceAnalysis: faceAnalysis,
          userImage: userImage,
          routine: result.routine,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate image");
      }

      // 将响应转换为 data URL
      const blob = await response.blob();
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });

      return dataUrl;
    } catch (error) {
      console.error("Failed to generate image:", error);
      return null;
    } finally {
      setIsGeneratingImage(false);
    }
  }, [result, faceAnalysis, userImage]);

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
   * 分享到微信（复制链接并提示）
   */
  const handleShareWechat = useCallback(async () => {
    if (!result) return;

    const shareUrl = generateShareUrl("/advisor", { ref: "wechat" });

    const success = await copyToClipboard(shareUrl);
    if (success) {
      setShareStatus("copied");
      setTimeout(() => setShareStatus("idle"), 2000);
      toast.success("链接已复制，快去微信分享给好友吧～");
      trackResultShare("wechat");
    }
  }, [result, toast, trackResultShare]);

  /**
   * 分享到小红书（复制文案并提示）
   */
  const handleShareXiaohongshu = useCallback(async () => {
    if (!result) return;

    const shareUrl = generateShareUrl("/advisor", { ref: "xiaohongshu" });
    const { title, description } = generateShareText();
    const text = `${title}\n\n${description}\n\n🔗 ${shareUrl}`;

    const success = await copyToClipboard(text);
    if (success) {
      setShareStatus("copied");
      setTimeout(() => setShareStatus("idle"), 2000);
      toast.success("文案已复制，快去小红书发笔记吧～");
      trackResultShare("xiaohongshu");
    }
  }, [result, toast, trackResultShare]);

  /**
   * 分享到抖音（复制文案并提示）
   */
  const handleShareDouyin = useCallback(async () => {
    if (!result) return;

    const shareUrl = generateShareUrl("/advisor", { ref: "douyin" });
    const { title, description } = generateShareText();
    const text = `${title}\n\n${description}\n\n🔗 ${shareUrl}`;

    const success = await copyToClipboard(text);
    if (success) {
      setShareStatus("copied");
      setTimeout(() => setShareStatus("idle"), 2000);
      toast.success("文案已复制，快去抖音分享吧～");
      trackResultShare("douyin");
    }
  }, [result, toast, trackResultShare]);

  /**
   * 悬浮球分享选项配置
   */
  const shareOptions: ShareOption[] = [
    {
      key: "wechat",
      label: "微信",
      icon: ShareIcons.Wechat,
      bgColor: "bg-[#07C160] text-white",
      onClick: handleShareWechat,
    },
    {
      key: "weibo",
      label: "微博",
      icon: ShareIcons.Weibo,
      bgColor: "bg-white text-gray-800",
      onClick: handleShareWeibo,
    },
    {
      key: "xiaohongshu",
      label: "小红书",
      icon: ShareIcons.Xiaohongshu,
      bgColor: "bg-[#FE2C55] text-white",
      onClick: handleShareXiaohongshu,
    },
    {
      key: "douyin",
      label: "抖音",
      icon: ShareIcons.Douyin,
      bgColor: "bg-black text-white",
      onClick: handleShareDouyin,
    },
    {
      key: "copy",
      label: "复制链接",
      icon: ShareIcons.Copy,
      bgColor: "bg-white text-gray-800",
      onClick: handleCopyLink,
    },
  ];

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
          <p className="mt-4 text-sm text-brand-charcoal/60">正在分析您的肌肤...</p>
        </div>
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <div className="text-center">
          <p className="text-sm text-red-500">{error}</p>
          <button
            onClick={handleRetry}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand-gold px-6 py-2 text-sm text-white"
          >
            <RefreshCw className="h-4 w-4" />
            重试
          </button>
        </div>
      </div>
    );
  }

  // 检查面部分析是否因技术原因失败（降级结果）
  const isFaceAnalysisFailed = faceAnalysis?.skinType?.description?.includes("技术原因");

  // 技术原因分析失败状态 - 提示用户重新分析
  if (isFaceAnalysisFailed) {
    const handleReanalyze = () => {
      // 清除当前的面部分析结果和综合分析结果
      sessionStorage.removeItem("advisorFaceAnalysis");
      sessionStorage.removeItem("advisorResult");
      // 重新跳转到分析页面
      router.push("/advisor/analyzing");
    };

    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50">
            <AlertCircle className="h-8 w-8 text-amber-500" />
          </div>
          <h2 className="mb-3 font-serif text-xl text-brand-charcoal">
            分析暂时无法完成
          </h2>
          <p className="mb-6 text-sm leading-relaxed text-brand-charcoal/60">
            由于技术原因，面部分析未能成功完成。请稍后重新尝试，或在网络环境更好时再次分析。
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={handleReanalyze}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-gold px-6 py-3 text-sm font-medium text-white shadow-luxury transition-all hover:shadow-luxury-lg"
            >
              <RefreshCw className="h-4 w-4" />
              重新分析
            </button>
            <button
              onClick={handleRestart}
              className="text-sm text-brand-charcoal/60 transition-colors hover:text-brand-charcoal"
            >
              返回重新填写问卷
            </button>
          </div>
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
        <span className="text-xs tracking-wider text-brand-charcoal/60">
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
      {mounted && createPortal(
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
                    <p className="mt-0.5 text-xs text-brand-charcoal/60">将您的肌肤分析报告分享给朋友</p>
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
                  {/* 微信 */}
                  <button onClick={handleCopyLink} className="group flex flex-col items-center gap-2">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#07C160] shadow-sm transition-all group-hover:shadow-md group-active:scale-95">
                      <svg className="h-7 w-7 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088v-.001c-.135-.007-.27-.023-.407-.033zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/>
                      </svg>
                    </div>
                    <span className="text-xs text-brand-charcoal/60">微信</span>
                  </button>

                  {/* 微博 */}
                  <button onClick={handleShareWeibo} className="group flex flex-col items-center gap-2">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm transition-all group-hover:shadow-md group-active:scale-95">
		                      <svg
		                        className="h-8 w-8"
		                        viewBox="0 0 1024 1024"
		                        xmlns="http://www.w3.org/2000/svg"
		                      >
		                        <path
		                          d="M851.4 590.193c-22.196-66.233-90.385-90.422-105.912-91.863-15.523-1.442-29.593-9.94-19.295-27.505 10.302-17.566 29.304-68.684-7.248-104.681-36.564-36.14-116.512-22.462-173.094 0.866-56.434 23.327-53.39 7.055-51.65-8.925 1.89-16.848 32.355-111.02-60.791-122.395C311.395 220.86 154.85 370.754 99.572 457.15 16 587.607 29.208 675.873 29.208 675.873h0.58c10.009 121.819 190.787 218.869 412.328 218.869 190.5 0 350.961-71.853 398.402-169.478 0 0 0.143-0.433 0.575-1.156 4.938-10.506 8.71-21.168 11.035-32.254 6.668-26.205 11.755-64.215-0.728-101.66z m-436.7 251.27c-157.71 0-285.674-84.095-285.674-187.768 0-103.671 127.82-187.76 285.674-187.76 157.705 0 285.673 84.089 285.673 187.76 0 103.815-127.968 187.768-285.673 187.768z"
		                          fill="#E71F19"
		                        />
		                        <path
		                          d="M803.096 425.327c2.896 1.298 5.945 1.869 8.994 1.869 8.993 0 17.7-5.328 21.323-14.112 5.95-13.964 8.993-28.793 8.993-44.205 0-62.488-51.208-113.321-114.181-113.321-15.379 0-30.32 3.022-44.396 8.926-11.755 4.896-17.263 18.432-12.335 30.24 4.933 11.662 18.572 17.134 30.465 12.238 8.419-3.46 17.268-5.33 26.41-5.33 37.431 0 67.752 30.241 67.752 67.247 0 9.068-1.735 17.857-5.369 26.202a22.832 22.832 0 0 0 12.335 30.236l0.01 0.01z"
		                          fill="#F5AA15"
		                        />
		                        <path
		                          d="M726.922 114.157c-25.969 0-51.65 3.744-76.315 10.942-18.423 5.472-28.868 24.622-23.5 42.91 5.509 18.29 24.804 28.657 43.237 23.329a201.888 201.888 0 0 1 56.578-8.064c109.253 0 198.189 88.271 198.189 196.696 0 19.436-2.905 38.729-8.419 57.16-5.508 18.289 4.79 37.588 23.212 43.053 3.342 1.014 6.817 1.442 10.159 1.442 14.943 0 28.725-9.648 33.37-24.48 7.547-24.906 11.462-50.826 11.462-77.175-0.143-146.588-120.278-265.813-267.973-265.813z"
		                          fill="#F5AA15"
		                        />
		                        <path
		                          d="M388.294 534.47c-84.151 0-152.34 59.178-152.34 132.334 0 73.141 68.189 132.328 152.34 132.328 84.148 0 152.337-59.182 152.337-132.328 0-73.15-68.19-132.334-152.337-132.334zM338.53 752.763c-29.454 0-53.39-23.755-53.39-52.987 0-29.228 23.941-52.989 53.39-52.989 29.453 0 53.39 23.76 53.39 52.989 0 29.227-23.937 52.987-53.39 52.987z m99.82-95.465c-6.382 11.086-19.296 15.696-28.726 10.219-9.43-5.323-11.75-18.717-5.37-29.803 6.386-11.09 19.297-15.7 28.725-10.224 9.43 5.472 11.755 18.864 5.37 29.808z"
		                          fill="#040000"
		                        />
		                      </svg>
                    </div>
                    <span className="text-xs text-brand-charcoal/60">微博</span>
                  </button>

                  {/* 小红书 */}
                  <button onClick={handleCopyLink} className="group flex flex-col items-center gap-2">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FE2C55] shadow-sm transition-all group-hover:shadow-md group-active:scale-95">
	                      <svg
	                        className="h-8 w-8"
	                        viewBox="0 0 1024 1024"
	                        xmlns="http://www.w3.org/2000/svg"
	                      >
	                        <path
	                          d="M19.242667 401.066667h68.053333s-7.936 113.962667-10.026667 133.973333c-2.090667 20.053333-9.6 73.898667-39.253333 108.117333L3.370667 567.594667c0 0.042667 7.936-7.509333 15.872-166.528zM133.461333 310.656h68.437334v315.008s-13.909333 49.536-52.309334 48.981333h-36.736l-29.866666-59.349333h44.074666c4.736 0 4.608-6.528 4.608-4.778667 0.042667 3.882667 1.792-299.861333 1.792-299.861333zM476.288 307.84l-34.517333 77.909333s-6.101333 15.573333 3.882666 16.128c10.026667 0.554667 57.301333 0 57.301334 0l-47.872 107.392s-4.992 13.909333 4.437333 13.909334h35.626667l-23.722667 55.637333h-78.08s-33.962667-4.992-20.053333-35.626667 34.517333-79.018667 34.517333-79.018666l-35.072 0.554666s-31.701333-6.698667-16.128-38.954666c15.573333-32.298667 54.528-117.973333 54.528-117.973334h65.152zM247.552 400.256H314.88s8.917333 162.773333 16 163.370667l-34.389333 77.610666s-31.701333-23.936-40.064-120.490666c-6.869333-79.701333-8.874667-120.490667-8.874667-120.490667zM362.752 600.576s2.218667 6.101333 27.818667 6.101333h77.909333l-31.146667 67.328H354.389333s-24.192 0.554667-23.509333-7.253333l31.872-66.176zM679.424 333.44v67.370667h-42.325333v205.909333h65.706666v67.328h-225.408l29.482667-66.773333h57.898667l1.109333-207.018667-40.618667-0.554667-1.664-66.261333z"
	                          fill="#ffffff"
	                        />
	                        <path
	                          d="M1024 615.04v-94.592c0-56.192-59.648-58.453333-59.648-58.453333h-17.237333V399.658667c0.554667-57.301333-68.992-66.218667-68.992-66.218667h-42.837334v-26.154667h-66.773333l1.109333 26.154667h-47.317333v66.218667h45.653333v62.890666H698.88v67.328l68.992 0.554667v143.573333h67.328V529.92h107.392c14.464 0 15.573333 14.464 15.573333 14.464s3.626667 39.381333 2.645334 56.192c-0.981333 16.682667-13.226667 15.573333-13.226667 15.573333h-55.637333l26.709333 57.898667h50.645333c59.050667 0 54.698667-59.008 54.698667-59.008z m-142.592-209.493333v55.637333H834.133333V400.512h40.362667c7.808 0 6.912 5.034667 6.912 5.034667z"
	                          fill="#ffffff"
	                        />
	                        <path
	                          d="M992 398.549333H960v-32c0-17.578667 14.421333-32 32-32 17.621333 0 32 14.421333 32 32s-14.378667 32-32 32z"
	                          fill="#ffffff"
	                        />
	                      </svg>
                    </div>
                    <span className="text-xs text-brand-charcoal/60">小红书</span>
                  </button>

                  {/* 抖音 */}
                  <button onClick={handleCopyLink} className="group flex flex-col items-center gap-2">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black shadow-sm transition-all group-hover:shadow-md group-active:scale-95">
                      <svg
                        className="h-8 w-8"
                        viewBox="0 0 1024 1024"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M0 0m184.32 0l655.36 0q184.32 0 184.32 184.32l0 655.36q0 184.32-184.32 184.32l-655.36 0q-184.32 0-184.32-184.32l0-655.36q0-184.32 184.32-184.32Z"
                          fill="#111111"
                        />
                        <path
                          d="M204.27776 670.59712a246.25152 246.25152 0 0 1 245.97504-245.97504v147.57888a98.49856 98.49856 0 0 0-98.38592 98.38592c0 48.34304 26.14272 100.352 83.54816 100.352 3.81952 0 93.55264-0.88064 93.55264-77.19936V134.35904h157.26592a133.31456 133.31456 0 0 0 133.12 132.99712l-0.13312 147.31264a273.152 273.152 0 0 1-142.62272-38.912l-0.06144 317.98272c0 146.00192-124.24192 224.77824-241.14176 224.77824-131.74784 0.03072-231.1168-106.56768-231.1168-247.92064z"
                          fill="#FF4040"
                        />
                        <path
                          d="M164.92544 631.23456a246.25152 246.25152 0 0 1 245.97504-245.97504v147.57888a98.49856 98.49856 0 0 0-98.38592 98.38592c0 48.34304 26.14272 100.352 83.54816 100.352 3.81952 0 93.55264-0.88064 93.55264-77.19936V94.99648h157.26592a133.31456 133.31456 0 0 0 133.12 132.99712l-0.13312 147.31264a273.152 273.152 0 0 1-142.62272-38.912l-0.06144 317.98272c0 146.00192-124.24192 224.77824-241.14176 224.77824-131.74784 0.03072-231.1168-106.56768-231.1168-247.92064z"
                          fill="#00F5FF"
                        />
                        <path
                          d="M410.91072 427.58144c-158.8224 20.15232-284.44672 222.72-154.112 405.00224 120.40192 98.47808 373.68832 41.20576 380.70272-171.85792l-0.17408-324.1472a280.7296 280.7296 0 0 0 142.88896 38.62528V261.2224a144.98816 144.98816 0 0 1-72.8064-54.82496 135.23968 135.23968 0 0 1-54.70208-72.45824h-123.66848l-0.08192 561.41824c-0.11264 78.46912-130.9696 106.41408-164.18816 30.2592-83.18976-39.77216-64.37888-190.9248 46.31552-192.57344z"
                          fill="#FFFFFF"
                        />
                      </svg>
                    </div>
                    <span className="text-xs text-brand-charcoal/60">抖音</span>
                  </button>

                  {/* 复制链接 */}
                  <button onClick={handleCopyLink} className="group flex flex-col items-center gap-2">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm transition-all group-hover:shadow-md group-active:scale-95">
                      <svg className="h-6 w-6 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                      </svg>
                    </div>
                    <span className="text-xs text-brand-charcoal/60">复制链接</span>
                  </button>

                  {/* 更多分享方式（原生分享）*/}
                  {canNativeShare && (
                    <button onClick={handleNativeShare} className="group flex flex-col items-center gap-2">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm transition-all group-hover:shadow-md group-active:scale-95">
                        <Share2 className="h-6 w-6 text-brand-charcoal/60" />
                      </div>
                      <span className="text-xs text-brand-charcoal/60">更多分享</span>
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
      </AnimatePresence>,
      document.body
      )}

      {/* 页面标题 - 高奢品牌风格 */}
      <m.div
        className="mb-8 text-center lg:mb-10"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      >
        {/* 装饰性分隔线 */}
        <m.div
          className="mx-auto mb-4 flex items-center justify-center gap-3"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          <span className="h-px w-8 bg-gradient-to-r from-transparent to-brand-gold/50" />
          <Star className="h-4 w-4 text-brand-gold" />
          <span className="h-px w-8 bg-gradient-to-l from-transparent to-brand-gold/50" />
        </m.div>

        {/* 徽章 */}
        <m.div
          className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand-gold/20 bg-gradient-to-r from-brand-champagne/30 via-white to-brand-champagne/30 px-5 py-2 shadow-sm backdrop-blur-sm"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
        >
          <span className="text-sm font-light tracking-wider text-brand-gold">
            {result.dataSource === "comprehensive" ? "✨ 综合分析完成" : "📋 问卷分析完成"}
          </span>
        </m.div>

        {/* 主标题 */}
        <m.h1
          className="font-serif text-2xl font-light tracking-wide text-brand-charcoal lg:text-3xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          您的专属肌肤报告
        </m.h1>
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

        {/* 综合分析摘要 - 高奢卡片风格 */}
        <m.div
          variants={fadeInUp}
          transition={defaultTransition}
          className="relative overflow-hidden rounded-2xl border border-brand-beige/50 bg-white/95 p-5 shadow-card backdrop-blur-sm"
        >
          {/* 装饰性背景 */}
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-radial-gold opacity-30" />

          <h3 className="relative mb-4 flex items-center gap-2.5 font-serif text-base font-light tracking-wide text-brand-charcoal">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-gold/20 to-brand-champagne/40">
              <Sparkles className="h-4 w-4 text-brand-gold" />
            </div>
            综合分析
          </h3>
          <p className="relative mb-4 text-sm leading-relaxed text-brand-charcoal/80">{result.analysis.summary}</p>
          <ul className="relative space-y-2">
            {result.analysis.details.map((detail, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed text-brand-charcoal/70">
                <span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-brand-gold" />
                {detail}
              </li>
            ))}
          </ul>
        </m.div>

        {/* 护肤方案 - 四个按钮展示 */}
        <m.div
          variants={fadeInUp}
          transition={defaultTransition}
          className="relative overflow-hidden rounded-2xl bg-white/95 shadow-card backdrop-blur-sm"
        >
          {/* 标题区域 */}
          <div className="px-5 pt-5 pb-2">
            <h3 className="text-center font-serif text-base font-light tracking-wide text-brand-charcoal">专属护肤方案</h3>
            <p className="mt-1 text-center text-xs text-brand-charcoal/50">点击查看详细护肤仪式</p>
          </div>
          {/* 按钮区域 */}
          <div className="grid grid-cols-4 px-2 pb-4">
            <button
              onClick={() => setRoutineModal("morning")}
              className="group flex flex-col items-center justify-center gap-3 rounded-xl px-2 py-4 transition-all duration-300 hover:-translate-y-0.5 hover:bg-brand-champagne/30 active:translate-y-0 sm:gap-4 sm:px-4 sm:py-5"
            >
              <SunIcon className="h-10 w-10 transition-transform duration-300 group-hover:scale-110 sm:h-12 sm:w-12" />
              <span className="text-xs font-medium text-brand-charcoal/60 transition-colors duration-300 group-hover:text-brand-charcoal sm:text-sm">晨间仪式</span>
            </button>
            <button
              onClick={() => setRoutineModal("evening")}
              className="group flex flex-col items-center justify-center gap-3 rounded-xl px-2 py-4 transition-all duration-300 hover:-translate-y-0.5 hover:bg-brand-champagne/30 active:translate-y-0 sm:gap-4 sm:px-4 sm:py-5"
            >
              <MoonIcon className="h-10 w-10 transition-transform duration-300 group-hover:scale-110 sm:h-12 sm:w-12" />
              <span className="text-xs font-medium text-brand-charcoal/60 transition-colors duration-300 group-hover:text-brand-charcoal sm:text-sm">晚间仪式</span>
            </button>
            <button
              onClick={() => setRoutineModal("family")}
              className="group flex flex-col items-center justify-center gap-3 rounded-xl px-2 py-4 transition-all duration-300 hover:-translate-y-0.5 hover:bg-brand-champagne/30 active:translate-y-0 sm:gap-4 sm:px-4 sm:py-5"
            >
              <HeartIcon className="h-10 w-10 transition-transform duration-300 group-hover:scale-110 sm:h-12 sm:w-12" />
              <span className="text-xs font-medium text-brand-charcoal/60 transition-colors duration-300 group-hover:text-brand-charcoal sm:text-sm">家庭护肤</span>
            </button>
            <button
              onClick={() => setRoutineModal("travel")}
              className="group flex flex-col items-center justify-center gap-3 rounded-xl px-2 py-4 transition-all duration-300 hover:-translate-y-0.5 hover:bg-brand-champagne/30 active:translate-y-0 sm:gap-4 sm:px-4 sm:py-5"
            >
              <TravelIcon className="h-10 w-10 transition-transform duration-300 group-hover:scale-110 sm:h-12 sm:w-12" />
              <span className="text-xs font-medium text-brand-charcoal/60 transition-colors duration-300 group-hover:text-brand-charcoal sm:text-sm">旅行护肤</span>
            </button>
          </div>
        </m.div>

        {/* 护肤方案模态框 */}
        {mounted && createPortal(
          <AnimatePresence>
            {routineModal && (
              <>
                {/* 遮罩 */}
                <m.div
                  className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setRoutineModal(null)}
                />
              {/* 模态框 */}
              <m.div
                className={isMobile
                  ? "fixed bottom-0 left-0 right-0 z-50 flex max-h-[90vh] w-full flex-col overflow-hidden"
                  : "fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[480px] flex-col overflow-hidden"
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
                <div className={`flex flex-col bg-[#EBE8DB] ${isMobile ? "rounded-t-[2rem]" : "rounded-2xl shadow-2xl"}`}>
                  {/* 固定头部区域 */}
                  <div className={`flex-shrink-0 px-6 ${isMobile ? "pt-5" : "pt-5"}`}>
                    {/* 顶部拖动指示条 - 仅移动端显示 */}
                    {isMobile && <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-brand-charcoal/20" />}

                    {/* 标题区域 */}
                    <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {routineModal === "morning" && (
                        <>
                          <SunIcon className="h-12 w-12" />
                          <div>
                            <h3 className="font-serif text-xl text-brand-charcoal">晨间仪式</h3>
                            <p className="text-xs uppercase tracking-widest text-brand-charcoal/50">MORNING RITUAL</p>
                          </div>
                        </>
                      )}
                      {routineModal === "evening" && (
                        <>
                          <MoonIcon className="h-12 w-12" />
                          <div>
                            <h3 className="font-serif text-xl text-brand-charcoal">晚间仪式</h3>
                            <p className="text-xs uppercase tracking-widest text-brand-charcoal/50">EVENING RITUAL</p>
                          </div>
                        </>
                      )}
                      {routineModal === "family" && (
                        <>
                          <HeartIcon className="h-12 w-12" />
                          <div>
                            <h3 className="font-serif text-xl text-brand-charcoal">家庭护肤</h3>
                            <p className="text-xs uppercase tracking-widest text-brand-charcoal/50">FAMILY SKINCARE</p>
                          </div>
                        </>
                      )}
                      {routineModal === "travel" && (
                        <>
                          <TravelIcon className="h-12 w-12" />
                          <div>
                            <h3 className="font-serif text-xl text-brand-charcoal">旅行护肤</h3>
                            <p className="text-xs uppercase tracking-widest text-brand-charcoal/50">TRAVEL SKINCARE</p>
                          </div>
                        </>
                      )}
                    </div>
                      <button
                        onClick={() => setRoutineModal(null)}
                        className="flex h-9 w-9 items-center justify-center rounded-full text-brand-charcoal/40 transition-colors hover:bg-white/60 hover:text-brand-charcoal"
                        aria-label="关闭"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* 可滚动内容区域 */}
                  <div className={`flex-1 overflow-y-auto px-6 scrollbar-hide ${isMobile ? "pb-10" : "pb-6"}`}>
                    {/* 内容区域 - 晨间仪式 */}
                    {routineModal === "morning" && (
                      <div className="space-y-3">
                        <p className="text-sm leading-relaxed text-brand-charcoal/60">清晨护肤，唤醒肌肤活力，为新的一天注入能量</p>
                        {[
                          { order: 1, name: "洁面", nameEn: "CLEANSE", duration: "1-2分钟", description: "用温水轻柔唤醒肌肤，云朵洁面慕斯打出绵密泡沫，轻轻按摩全脸后冲洗干净。", productSlug: "foam-cleanser" },
                          { order: 2, name: "精华", nameEn: "SERUM", duration: "30秒", description: "取适量修护紧致精华于掌心温热，轻拍于面部，由内向外、由下向上轻柔按压至吸收。", productSlug: "serum" },
                          { order: 3, name: "面霜", nameEn: "CREAM", duration: "1分钟", description: "取黄豆大小逆龄面霜，均匀涂抹于面部，配合提拉手法按摩，锁住水分与营养。", productSlug: "face-cream" },
                          { order: 4, name: "防晒", nameEn: "SUNSCREEN", duration: "30秒", description: "最后一步，涂抹足量轻透防晒霜，为肌肤撑起保护伞，开启元气满满的一天。", productSlug: "sunscreen" },
                        ].map((step, index, arr) => (
                          <div key={step.order} className="group relative rounded-2xl bg-white/90 p-4 shadow-sm transition-all duration-200 hover:bg-white hover:shadow-md">
                            {/* 连接线 - 除了最后一个 */}
                            {index < arr.length - 1 && (
                              <div className="absolute left-[26px] top-[calc(100%+2px)] h-[calc(0.75rem-4px)] w-px bg-gradient-to-b from-brand-gold/30 to-transparent" />
                            )}
                            <div className="flex items-start gap-3">
                              {/* 序号圆圈 */}
                              <div className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-champagne/80 to-brand-beige/60 shadow-sm">
                                <span className="font-serif text-sm font-medium text-brand-charcoal/70">
                                  {String(step.order).padStart(2, "0")}
                                </span>
                              </div>
                              <div className="min-w-0 flex-1 pt-0.5">
                                <div className="flex items-baseline gap-2">
                                  <h4 className="font-serif text-[15px] font-medium text-brand-charcoal">{step.name}</h4>
                                  <span className="text-[10px] uppercase tracking-widest text-brand-charcoal/35">{step.nameEn}</span>
                                  <span className="ml-auto flex-shrink-0 rounded-full bg-brand-champagne/50 px-2 py-0.5 text-[10px] text-brand-charcoal/50">{step.duration}</span>
                                </div>
                                <p className="mt-1.5 text-[13px] leading-relaxed text-brand-charcoal/55">{step.description}</p>
                                <Link
                                  href={`/products/${step.productSlug}`}
                                  onClick={() => setRoutineModal(null)}
                                  className="mt-2 inline-flex items-center gap-0.5 text-xs text-brand-gold/70 transition-all hover:gap-1.5 hover:text-brand-gold"
                                >
                                  <span>查看推荐产品</span>
                                  <ChevronRight className="h-3.5 w-3.5" />
                                </Link>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 内容区域 - 晚间仪式 */}
                    {routineModal === "evening" && (
                      <div className="space-y-3">
                        <p className="text-sm leading-relaxed text-brand-charcoal/60">夜间护肤，修护一天的疲惫，让肌肤在睡眠中焕新</p>
                        {[
                          { order: 1, name: "洁面", nameEn: "CLEANSE", duration: "1-2分钟", description: "云朵洁面慕斯温和清洁，洗去一天的疲惫与污垢，为后续护肤做好准备。", productSlug: "foam-cleanser" },
                          { order: 2, name: "精华", nameEn: "SERUM", duration: "30秒", description: "夜间是肌肤修护的黄金时段，修护紧致精华帮助深层滋养，修复日间损伤。", productSlug: "serum" },
                          { order: 3, name: "护理油", nameEn: "OIL", duration: "30秒", description: "臻萃护理油加强滋养，轻柔按摩促进吸收，为肌肤注入奢润能量（可选步骤）。", productSlug: "treatment-oil" },
                          { order: 4, name: "面霜", nameEn: "CREAM", duration: "1分钟", description: "逆龄面霜质地滋润，配合轻柔按摩，让营养在睡眠中持续渗透，次日醒来容光焕发。", productSlug: "face-cream" },
                        ].map((step, index, arr) => (
                          <div key={step.order} className="group relative rounded-2xl bg-white/90 p-4 shadow-sm transition-all duration-200 hover:bg-white hover:shadow-md">
                            {/* 连接线 - 除了最后一个 */}
                            {index < arr.length - 1 && (
                              <div className="absolute left-[26px] top-[calc(100%+2px)] h-[calc(0.75rem-4px)] w-px bg-gradient-to-b from-brand-gold/30 to-transparent" />
                            )}
                            <div className="flex items-start gap-3">
                              {/* 序号圆圈 */}
                              <div className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-champagne/80 to-brand-beige/60 shadow-sm">
                                <span className="font-serif text-sm font-medium text-brand-charcoal/70">
                                  {String(step.order).padStart(2, "0")}
                                </span>
                              </div>
                              <div className="min-w-0 flex-1 pt-0.5">
                                <div className="flex items-baseline gap-2">
                                  <h4 className="font-serif text-[15px] font-medium text-brand-charcoal">{step.name}</h4>
                                  <span className="text-[10px] uppercase tracking-widest text-brand-charcoal/35">{step.nameEn}</span>
                                  <span className="ml-auto flex-shrink-0 rounded-full bg-brand-champagne/50 px-2 py-0.5 text-[10px] text-brand-charcoal/50">{step.duration}</span>
                                </div>
                                <p className="mt-1.5 text-[13px] leading-relaxed text-brand-charcoal/55">{step.description}</p>
                                <Link
                                  href={`/products/${step.productSlug}`}
                                  onClick={() => setRoutineModal(null)}
                                  className="mt-2 inline-flex items-center gap-0.5 text-xs text-brand-gold/70 transition-all hover:gap-1.5 hover:text-brand-gold"
                                >
                                  <span>查看推荐产品</span>
                                  <ChevronRight className="h-3.5 w-3.5" />
                                </Link>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 内容区域 - 家庭护肤 */}
                    {routineModal === "family" && (
                      <div className="space-y-3">
                        <p className="text-sm leading-relaxed text-brand-charcoal/60">与家人一起，享受护肤的温馨时光，在彼此的呵护中，感受爱与美的交融</p>
                        {[
                          { order: 1, name: "面对面护肤", nameEn: "FACE TO FACE", description: "相对而坐，为彼此涂抹护肤品。用指尖传递温柔，在每一次触碰中加深情感连接。" },
                          { order: 2, name: "互相按摩", nameEn: "MASSAGE", description: "轮流为对方进行面部按摩，配合舒缓的音乐与香氛，创造属于你们的私密SPA时光。" },
                          { order: 3, name: "仪式感布置", nameEn: "AMBIANCE", description: "点上香薰蜡烛，播放轻柔音乐，准备好柔软的毛巾和温热的花茶，让护肤成为一场浪漫约会。" },
                        ].map((step, index, arr) => (
                          <div key={step.order} className="group relative rounded-2xl bg-white/90 p-4 shadow-sm transition-all duration-200 hover:bg-white hover:shadow-md">
                            {/* 连接线 - 除了最后一个 */}
                            {index < arr.length - 1 && (
                              <div className="absolute left-[26px] top-[calc(100%+2px)] h-[calc(0.75rem-4px)] w-px bg-gradient-to-b from-brand-gold/30 to-transparent" />
                            )}
                            <div className="flex items-start gap-3">
                              {/* 序号圆圈 */}
                              <div className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-champagne/80 to-brand-beige/60 shadow-sm">
                                <span className="font-serif text-sm font-medium text-brand-charcoal/70">
                                  {String(step.order).padStart(2, "0")}
                                </span>
                              </div>
                              <div className="min-w-0 flex-1 pt-0.5">
                                <div className="flex items-baseline gap-2">
                                  <h4 className="font-serif text-[15px] font-medium text-brand-charcoal">{step.name}</h4>
                                  <span className="text-[10px] uppercase tracking-widest text-brand-charcoal/35">{step.nameEn}</span>
                                </div>
                                <p className="mt-1.5 text-[13px] leading-relaxed text-brand-charcoal/55">{step.description}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                        <div className="mt-2 rounded-2xl bg-white/70 p-4 text-center">
                          <p className="text-sm text-brand-charcoal/55">探索适合家庭护肤的产品组合</p>
                          <Link
                            href="/products"
                            onClick={() => setRoutineModal(null)}
                            className="mt-2 inline-flex items-center gap-0.5 text-xs text-brand-gold/70 transition-all hover:gap-1.5 hover:text-brand-gold"
                          >
                            <span>查看产品系列</span>
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </div>
                    )}

                    {/* 内容区域 - 旅行护肤 */}
                    {routineModal === "travel" && (
                      <div className="space-y-3">
                        <p className="text-sm leading-relaxed text-brand-charcoal/60">旅途中的护肤方案，轻便高效，让肌肤在任何目的地都保持最佳状态</p>
                        {[
                          { order: 1, name: "洁面", nameEn: "CLEANSE", duration: "1分钟", description: "旅行装云朵洁面慕斯，小巧便携，温和清洁旅途中的灰尘与疲惫。", productSlug: "foam-cleanser" },
                          { order: 2, name: "多效精华", nameEn: "MULTI-SERUM", duration: "30秒", description: "一瓶精华，多重功效，简化护肤步骤，适合旅途中快节奏的生活方式。", productSlug: "serum" },
                          { order: 3, name: "保湿锁水", nameEn: "MOISTURIZE", duration: "30秒", description: "旅途中机舱干燥、环境变化，面霜帮助锁住水分，保持肌肤滋润。", productSlug: "face-cream" },
                        ].map((step, index, arr) => (
                          <div key={step.order} className="group relative rounded-2xl bg-white/90 p-4 shadow-sm transition-all duration-200 hover:bg-white hover:shadow-md">
                            {/* 连接线 - 除了最后一个 */}
                            {index < arr.length - 1 && (
                              <div className="absolute left-[26px] top-[calc(100%+2px)] h-[calc(0.75rem-4px)] w-px bg-gradient-to-b from-brand-gold/30 to-transparent" />
                            )}
                            <div className="flex items-start gap-3">
                              {/* 序号圆圈 */}
                              <div className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-champagne/80 to-brand-beige/60 shadow-sm">
                                <span className="font-serif text-sm font-medium text-brand-charcoal/70">
                                  {String(step.order).padStart(2, "0")}
                                </span>
                              </div>
                              <div className="min-w-0 flex-1 pt-0.5">
                                <div className="flex items-baseline gap-2">
                                  <h4 className="font-serif text-[15px] font-medium text-brand-charcoal">{step.name}</h4>
                                  <span className="text-[10px] uppercase tracking-widest text-brand-charcoal/35">{step.nameEn}</span>
                                  <span className="ml-auto flex-shrink-0 rounded-full bg-brand-champagne/50 px-2 py-0.5 text-[10px] text-brand-charcoal/50">{step.duration}</span>
                                </div>
                                <p className="mt-1.5 text-[13px] leading-relaxed text-brand-charcoal/55">{step.description}</p>
                                <Link
                                  href={`/products/${step.productSlug}`}
                                  onClick={() => setRoutineModal(null)}
                                  className="mt-2 inline-flex items-center gap-0.5 text-xs text-brand-gold/70 transition-all hover:gap-1.5 hover:text-brand-gold"
                                >
                                  <span>查看推荐产品</span>
                                  <ChevronRight className="h-3.5 w-3.5" />
                                </Link>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 底部查看完整护肤仪式链接 */}
                    <div className="mt-5 pt-3">
                      <Link
                        href="/ritual"
                        onClick={() => setRoutineModal(null)}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white/80 py-3.5 text-sm text-brand-charcoal/70 shadow-sm transition-all hover:bg-white hover:text-brand-charcoal hover:shadow-md"
                      >
                        <Sparkles className="h-4 w-4" />
                        查看完整护肤仪式
                      </Link>
                    </div>
                  </div>
                </div>
              </m.div>
            </>
          )}
        </AnimatePresence>,
        document.body
        )}

        {/* 免责声明 */}
        <m.div
          variants={fadeInUp}
          transition={defaultTransition}
          className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-600" />
            <div className="text-xs leading-relaxed text-amber-800/80">
              <p className="mb-1 text-xs font-medium text-amber-900">温馨提示</p>
              <p className="text-xs leading-relaxed">
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

        {/* 操作按钮 - 高奢风格 */}
        <m.div
          variants={fadeInUp}
          transition={defaultTransition}
          className="flex flex-col gap-3 pt-6 sm:flex-row"
        >
          <button
            onClick={handleRestart}
            className="group flex items-center justify-center gap-2.5 rounded-full border border-brand-beige bg-white/80 py-3.5 text-sm font-light tracking-wide text-brand-charcoal/70 shadow-card backdrop-blur-sm transition-all duration-300 hover:border-brand-gold/40 hover:bg-white hover:text-brand-charcoal hover:shadow-card-hover sm:flex-1"
          >
            <RefreshCw className="h-4 w-4 transition-transform group-hover:rotate-180" />
            重新测试
          </button>
          <Link
            href="/products"
            className="group relative flex items-center justify-center gap-2.5 overflow-hidden rounded-full bg-gradient-to-r from-brand-gold to-brand-gold-light py-3.5 text-sm font-light tracking-wide text-white shadow-luxury transition-all duration-300 hover:shadow-luxury-lg sm:flex-1"
          >
            {/* 光泽效果 */}
            <span className="absolute inset-0 -translate-x-full bg-shimmer transition-transform duration-700 group-hover:translate-x-full" />
            <ShoppingBag className="relative h-4 w-4" />
            <span className="relative">浏览全部产品</span>
          </Link>
        </m.div>

        {/* 底部间距 */}
        <div className="h-8" />
      </m.div>

      {/* 右侧悬浮分享球 */}
      <ShareFloatingButton
        options={shareOptions}
        onSaveImage={handleSaveToGallery}
        isGeneratingImage={isGeneratingImage}
        copied={shareStatus === "copied"}
      />

      {/* AI护肤顾问追问 */}
      <AdvisorChatPanel
        skinType={result?.skinProfile.type}
        concerns={result?.skinProfile.concerns}
      />
    </div>
  );
}

