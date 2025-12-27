"use client";

/**
 * 分享弹窗组件
 * 包含分享卡片预览、保存图片、下载 PDF 功能
 */

import { useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { m, AnimatePresence } from "framer-motion";
import { X, Download, FileText, Loader2, Lock, CheckCircle, ImageIcon, ArrowRight } from "lucide-react";
import { ShareCard } from "./ShareCard";
import { useShareAndPdf } from "./useShareAndPdf";
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

  const {
    isGenerating,
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

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
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
                ? "fixed bottom-0 left-0 right-0 z-50 max-h-[90vh] overflow-y-auto"
                : "fixed left-1/2 top-1/2 z-50 max-h-[90vh] overflow-hidden"
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
              <div className={`relative flex items-center justify-between ${isMobile ? "px-5 py-3" : "px-7 py-5"}`}>
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

              {/* 内容区域 */}
              <div className={`${isMobile ? "px-5 pb-2" : "flex gap-0"}`}>
                {/* 分享卡片预览 - 左侧 */}
                <div className={`${isMobile ? "flex justify-center pb-5" : "flex-shrink-0 border-r border-brand-charcoal/5 bg-gradient-to-br from-[#FAFAF8] to-[#F5F3EF] p-7"}`}>
                  <m.div
                    className="overflow-hidden rounded-2xl bg-white shadow-[0_8px_32px_-8px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.04]"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.4 }}
                  >
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
                  </m.div>
                </div>

                {/* 操作按钮区域 - 右侧 */}
                <div className={`${isMobile ? "" : "flex w-[300px] flex-col justify-between bg-white p-7"}`}>
                  {/* 功能卡片列表 */}
                  <div className="space-y-3">
                    {/* 保存图片卡片 */}
                    <m.button
                      onClick={saveShareCard}
                      disabled={isGenerating}
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
                          {isGenerating ? (
                            <Loader2 className={`h-6 w-6 animate-spin ${hasShared ? "text-emerald-600" : "text-white"}`} />
                          ) : hasShared ? (
                            <CheckCircle className="h-6 w-6 text-emerald-600" />
                          ) : (
                            <ImageIcon className="h-6 w-6 text-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`font-medium ${hasShared ? "text-emerald-900" : "text-white"}`}>
                            {isGenerating ? "正在生成..." : hasShared ? "已保存成功" : "保存分享卡片"}
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
                      onClick={downloadPdf}
                      disabled={!canDownloadPdf || isGenerating}
                      className={`group relative w-full overflow-hidden rounded-2xl p-4 text-left transition-all ${
                        canDownloadPdf
                          ? "bg-white ring-1 ring-brand-charcoal/10 hover:ring-brand-charcoal/20 hover:shadow-md"
                          : "bg-brand-charcoal/[0.02] ring-1 ring-brand-charcoal/5"
                      }`}
                      whileHover={canDownloadPdf ? { scale: 1.01 } : {}}
                      whileTap={canDownloadPdf ? { scale: 0.99 } : {}}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${
                          canDownloadPdf ? "bg-brand-charcoal/5" : "bg-brand-charcoal/[0.03]"
                        }`}>
                          {canDownloadPdf ? (
                            <FileText className="h-6 w-6 text-brand-charcoal/70" />
                          ) : (
                            <Lock className="h-5 w-5 text-brand-charcoal/30" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`font-medium ${canDownloadPdf ? "text-brand-charcoal" : "text-brand-charcoal/40"}`}>
                            下载完整 PDF 报告
                          </div>
                          <div className={`mt-0.5 text-sm ${canDownloadPdf ? "text-brand-charcoal/50" : "text-brand-charcoal/30"}`}>
                            {canDownloadPdf ? "包含详细分析与护肤建议" : "保存卡片后解锁此功能"}
                          </div>
                        </div>
                        {canDownloadPdf && (
                          <ArrowRight className="h-5 w-5 flex-shrink-0 text-brand-charcoal/30 transition-transform group-hover:translate-x-0.5" />
                        )}
                      </div>
                    </m.button>
                  </div>

                  {/* 底部提示 */}
                  <div className={`${isMobile ? "mt-5" : "mt-6"}`}>
                    <div className="flex items-center justify-center gap-2 text-xs text-brand-charcoal/40">
                      <Download className="h-3.5 w-3.5" />
                      <span>长按保存的图片可分享至微信</span>
                    </div>
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

