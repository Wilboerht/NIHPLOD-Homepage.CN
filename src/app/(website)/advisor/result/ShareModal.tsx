"use client";

/**
 * 分享弹窗组件
 * 包含社交平台分享按钮、保存图片、下载 PDF 功能
 */

import { useRef, useEffect, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { m, AnimatePresence } from "framer-motion";
import { X, Download, FileText, Loader2, Lock, CheckCircle, ImageIcon, ArrowRight } from "lucide-react";
import { ShareCard } from "./ShareCard";
import { useShareAndPdf } from "./useShareAndPdf";
import { ShareIcons } from "@/components/ui/ShareFloatingButton";
import { generateShareUrl, generateShareText, copyToClipboard, shareToWeibo } from "@/lib/share";
import type { FaceAnalysisResult } from "@/app/api/advisor/face-analyze/route";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  isMobile: boolean;
  // ShareCard 需要的数据
  skinType: string;
  skinTypeLabel: string;
  concerns: string[];
  skinAge?: number;
  summary: string;
  faceAnalysis?: FaceAnalysisResult | null;
  userImage?: string | null;
}

export function ShareModal({
  isOpen,
  onClose,
  isMobile,
  skinType,
  skinTypeLabel,
  concerns,
  skinAge,
  summary,
  faceAnalysis,
  userImage,
}: ShareModalProps) {
  const shareCardRef = useRef<HTMLDivElement>(null);
  const mounted = typeof window !== "undefined";
  const [copySuccess, setCopySuccess] = useState(false);

  const {
    isImageGenerating,
    isPdfGenerating,
    hasShared,
    canDownloadPdf,
    saveShareCard,
    downloadPdf,
  } = useShareAndPdf({
    shareCardRef,
  });

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // 生成分享文案
  const getShareText = useCallback(() => {
    const { title, description } = generateShareText();
    const shareUrl = generateShareUrl("/advisor", { ref: "share" });
    return { title, description, shareUrl, fullText: `${title}\n\n${description}\n\n🔗 ${shareUrl}` };
  }, []);

  // 微信分享 - 复制文案提示用户
  const handleShareWechat = useCallback(async () => {
    const { fullText } = getShareText();
    const success = await copyToClipboard(fullText);
    if (success) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
      alert("分享文案已复制！请打开微信粘贴分享～");
    }
  }, [getShareText]);

  // 微博分享
  const handleShareWeibo = useCallback(() => {
    const { title, description, shareUrl } = getShareText();
    shareToWeibo({ title, description, url: shareUrl });
  }, [getShareText]);

  // 小红书分享 - 复制文案
  const handleShareXiaohongshu = useCallback(async () => {
    const { fullText } = getShareText();
    const success = await copyToClipboard(fullText);
    if (success) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
      alert("分享文案已复制！请打开小红书粘贴分享～");
    }
  }, [getShareText]);

  // 抖音分享 - 复制文案
  const handleShareDouyin = useCallback(async () => {
    const { fullText } = getShareText();
    const success = await copyToClipboard(fullText);
    if (success) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
      alert("分享文案已复制！请打开抖音粘贴分享～");
    }
  }, [getShareText]);

  // 复制链接
  const handleCopyLink = useCallback(async () => {
    const { shareUrl } = getShareText();
    const success = await copyToClipboard(shareUrl);
    if (success) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
      alert("链接已复制到剪贴板～");
    }
  }, [getShareText]);

  if (!mounted) return null;

  // 避免 lint 警告
  void copySuccess;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 隐藏的分享卡片 - 用于截图 */}
          <div className="fixed -left-[9999px] -top-[9999px]">
            <ShareCard
              ref={shareCardRef}
              skinType={skinType}
              skinTypeLabel={skinTypeLabel}
              concerns={concerns}
              skinAge={skinAge}
              summary={summary}
              faceAnalysis={faceAnalysis}
              userImage={userImage}
            />
          </div>

          {/* 遮罩 */}
          <m.div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* 弹窗容器 */}
          <m.div
            className={
              isMobile
                ? "fixed bottom-0 left-0 right-0 z-50"
                : "fixed left-1/2 top-1/2 z-50 w-[360px]"
            }
            initial={isMobile ? { y: "100%" } : { opacity: 0, scale: 0.9, x: "-50%", y: "-45%" }}
            animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
            exit={isMobile ? { y: "100%" } : { opacity: 0, scale: 0.9, x: "-50%", y: "-45%" }}
            transition={isMobile ? { type: "spring", damping: 28, stiffness: 350 } : { duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className={`relative overflow-hidden bg-white ${isMobile ? "rounded-t-[28px] pb-8" : "rounded-[28px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.24)]"}`}>
              {/* 背景装饰 */}
              <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-brand-gold/5" />
              <div className="pointer-events-none absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-brand-gold/5" />

              {/* 顶部拖动条 - 移动端 */}
              {isMobile && (
                <div className="flex justify-center pt-3 pb-1">
                  <div className="h-1 w-10 rounded-full bg-brand-charcoal/10" />
                </div>
              )}

              {/* 头部 */}
              <div className={`relative flex items-center justify-between ${isMobile ? "px-5 py-3" : "px-6 py-5"}`}>
                <div>
                  <h3 className="font-serif text-xl font-semibold tracking-tight text-brand-charcoal">保存与分享</h3>
                  <p className="mt-1 text-sm text-brand-charcoal/50">将分析报告保存或分享给好友</p>
                </div>
                <button
                  onClick={onClose}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-brand-charcoal/40 transition-all hover:bg-brand-charcoal/5 hover:text-brand-charcoal/70"
                >
                  <X className="h-5 w-5" strokeWidth={2.5} />
                </button>
              </div>

              {/* 按钮区域 */}
              <div className={`${isMobile ? "px-5 pb-2" : "px-6 pb-6"}`}>
                {/* 社交平台分享按钮 */}
                <div className="mb-5">
                  <div className="mb-3 text-sm font-medium text-brand-charcoal/70">分享到社交平台</div>
                  <div className="flex justify-center gap-3">
                    {/* 微信 */}
                    <m.button
                      onClick={handleShareWechat}
                      className="flex flex-col items-center gap-1.5"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-md ring-1 ring-brand-charcoal/10 [&_svg]:h-7 [&_svg]:w-7">
                        {ShareIcons.Wechat}
                      </div>
                      <span className="text-xs text-brand-charcoal/60">微信</span>
                    </m.button>

                    {/* 微博 */}
                    <m.button
                      onClick={handleShareWeibo}
                      className="flex flex-col items-center gap-1.5"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-md ring-1 ring-brand-charcoal/10 [&_svg]:h-7 [&_svg]:w-7">
                        {ShareIcons.Weibo}
                      </div>
                      <span className="text-xs text-brand-charcoal/60">微博</span>
                    </m.button>

                    {/* 小红书 */}
                    <m.button
                      onClick={handleShareXiaohongshu}
                      className="flex flex-col items-center gap-1.5"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-md ring-1 ring-brand-charcoal/10 [&_svg]:h-7 [&_svg]:w-7">
                        {ShareIcons.Xiaohongshu}
                      </div>
                      <span className="text-xs text-brand-charcoal/60">小红书</span>
                    </m.button>

                    {/* 抖音 */}
                    <m.button
                      onClick={handleShareDouyin}
                      className="flex flex-col items-center gap-1.5"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-md ring-1 ring-brand-charcoal/10 [&_svg]:h-7 [&_svg]:w-7">
                        {ShareIcons.Douyin}
                      </div>
                      <span className="text-xs text-brand-charcoal/60">抖音</span>
                    </m.button>

                    {/* 复制链接 */}
                    <m.button
                      onClick={handleCopyLink}
                      className="flex flex-col items-center gap-1.5"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-md ring-1 ring-brand-charcoal/10 [&_svg]:h-7 [&_svg]:w-7">
                        {ShareIcons.Copy}
                      </div>
                      <span className="text-xs text-brand-charcoal/60">复制链接</span>
                    </m.button>
                  </div>
                </div>

                {/* 分隔线 */}
                <div className="mb-5 flex items-center gap-3">
                  <div className="h-px flex-1 bg-brand-charcoal/10" />
                  <span className="text-xs text-brand-charcoal/30">或者</span>
                  <div className="h-px flex-1 bg-brand-charcoal/10" />
                </div>

                <div className="space-y-3">
                  {/* 保存图片卡片 */}
                  <m.button
                    onClick={saveShareCard}
                    disabled={isImageGenerating}
                    className={`group relative w-full overflow-hidden rounded-2xl p-4 text-left transition-all ${
                      hasShared
                        ? "bg-emerald-50 ring-1 ring-emerald-200"
                        : "bg-gradient-to-r from-brand-gold to-amber-500 shadow-lg shadow-brand-gold/20"
                    } disabled:opacity-60`}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${
                        hasShared ? "bg-emerald-100" : "bg-white/20"
                      }`}>
                        {isImageGenerating ? (
                          <Loader2 className={`h-6 w-6 animate-spin ${hasShared ? "text-emerald-600" : "text-white"}`} />
                        ) : hasShared ? (
                          <CheckCircle className="h-6 w-6 text-emerald-600" />
                        ) : (
                          <ImageIcon className="h-6 w-6 text-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`font-medium ${hasShared ? "text-emerald-900" : "text-white"}`}>
                          {isImageGenerating ? "正在生成..." : hasShared ? "已保存成功" : "保存分享卡片"}
                        </div>
                        <div className={`mt-0.5 text-sm ${hasShared ? "text-emerald-600" : "text-white/70"}`}>
                          {hasShared ? "点击可再次保存" : "保存图片到手机相册"}
                        </div>
                      </div>
                      <ArrowRight className={`h-5 w-5 flex-shrink-0 transition-transform group-hover:translate-x-0.5 ${
                        hasShared ? "text-emerald-400" : "text-white/60"
                      }`} />
                    </div>
                  </m.button>

                  {/* 下载 PDF 卡片 */}
                  <m.button
                    onClick={() => {
                      // 额外检查防止重复点击
                      if (!isPdfGenerating && canDownloadPdf) {
                        downloadPdf();
                      }
                    }}
                    disabled={!canDownloadPdf || isPdfGenerating}
                    className={`group relative w-full overflow-hidden rounded-2xl p-4 text-left transition-all ${
                      canDownloadPdf && !isPdfGenerating
                        ? "bg-white ring-1 ring-brand-charcoal/10 hover:ring-brand-charcoal/20 hover:shadow-md"
                        : "bg-brand-charcoal/[0.02] ring-1 ring-brand-charcoal/5"
                    }`}
                    whileHover={canDownloadPdf && !isPdfGenerating ? { scale: 1.01 } : {}}
                    whileTap={canDownloadPdf && !isPdfGenerating ? { scale: 0.99 } : {}}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${
                        canDownloadPdf ? "bg-brand-charcoal/5" : "bg-brand-charcoal/[0.03]"
                      }`}>
                        {isPdfGenerating ? (
                          <Loader2 className="h-6 w-6 animate-spin text-brand-charcoal/70" />
                        ) : canDownloadPdf ? (
                          <FileText className="h-6 w-6 text-brand-charcoal/70" />
                        ) : (
                          <Lock className="h-5 w-5 text-brand-charcoal/30" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`font-medium ${canDownloadPdf ? "text-brand-charcoal" : "text-brand-charcoal/40"}`}>
                          {isPdfGenerating ? "正在生成 PDF..." : "下载完整 PDF 报告"}
                        </div>
                        <div className={`mt-0.5 text-sm ${canDownloadPdf ? "text-brand-charcoal/50" : "text-brand-charcoal/30"}`}>
                          {canDownloadPdf ? "包含详细分析与护肤建议" : "保存卡片后解锁此功能"}
                        </div>
                      </div>
                      {canDownloadPdf && !isPdfGenerating && (
                        <ArrowRight className="h-5 w-5 flex-shrink-0 text-brand-charcoal/30 transition-transform group-hover:translate-x-0.5" />
                      )}
                    </div>
                  </m.button>
                </div>

                {/* 底部提示 */}
                <div className="mt-5">
                  <div className="flex items-center justify-center gap-2 text-xs text-brand-charcoal/40">
                    <Download className="h-3.5 w-3.5" />
                    <span>长按保存的图片可分享至微信</span>
                  </div>
                </div>
              </div>
            </div>
          </m.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

