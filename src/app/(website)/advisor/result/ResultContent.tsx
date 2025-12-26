"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  AlertCircle,
} from "lucide-react";
import { FaceAnalysisResult, AdvisorChatPanel } from "@/components/website/advisor";
import { useAdvisorAnalytics } from "@/hooks/useAdvisorAnalytics";
import { SkincareRoutinePanel } from "./SkincareRoutinePanel";
import { ShareModal } from "./ShareModal";
import { fadeInUp, staggerContainer, defaultTransition } from "@/lib/animations";
import type { FaceAnalysisResult as FaceAnalysisData } from "@/app/api/advisor/face-analyze/route";
import {
  copyToClipboard,
  generateShareUrl,
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
  const [userLocation, setUserLocation] = useState<{ province?: string | null; city?: string | null } | null>(null);

  const [shareStatus, setShareStatus] = useState<"idle" | "copying" | "copied">("idle");
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [isMobile, setIsMobile] = useState(true); // 默认移动端，避免闪烁

  // 检测是否为移动端
  useEffect(() => {
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
   * 打开分享菜单
   */
  const handleShare = async () => {
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
   * 分享到微博（复制文案并提示）
   */
  const handleShareWeibo = useCallback(async () => {
    if (!result) return;

    const shareUrl = generateShareUrl("/advisor", { ref: "weibo" });
    const { title, description } = generateShareText();
    const text = `${title}\n\n${description}\n\n🔗 ${shareUrl}`;

    const success = await copyToClipboard(text);
    if (success) {
      setShareStatus("copied");
      setTimeout(() => setShareStatus("idle"), 2000);
      toast.success("文案已复制，快去微博分享吧～");
      trackResultShare("weibo");
    }
  }, [result, toast, trackResultShare]);

  /**
   * 复制链接
   */
  const handleCopyLink = useCallback(async () => {
    if (!result) return;

    const shareUrl = generateShareUrl("/advisor", { ref: "copy" });

    const success = await copyToClipboard(shareUrl);
    if (success) {
      setShareStatus("copied");
      setTimeout(() => setShareStatus("idle"), 2000);
      toast.success("链接已复制到剪贴板");
      trackResultShare("link");
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

      // 获取用户位置信息（通过 IP 解析，用于护肤用量推荐）
      const locationStr = sessionStorage.getItem("advisorUserLocation");
      if (locationStr) {
        try {
          setUserLocation(JSON.parse(locationStr));
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

      {/* 分享弹窗 */}
      {result && (
        <ShareModal
          isOpen={showShareMenu}
          onClose={() => setShowShareMenu(false)}
          isMobile={isMobile}
          skinType={result.skinProfile.type}
          skinTypeLabel={result.skinProfile.typeLabel}
          concerns={result.skinProfile.concerns}
          skinAge={result.skinProfile.skinAge}
          summary={result.analysis.summary}
          faceAnalysis={faceAnalysis}
          userImage={userImage}
        />
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

        {/* 专属护肤方案 - 三级别四场景 */}
        <m.div variants={fadeInUp} transition={defaultTransition}>
          <SkincareRoutinePanel
            skinType={result.skinProfile.type}
            province={userLocation?.province || undefined}
            city={userLocation?.city || undefined}
          />
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
        onSaveImage={handleShare}
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

