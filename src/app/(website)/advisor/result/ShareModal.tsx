"use client";

/**
 * 分享弹窗组件
 * 包含分享卡片预览、保存图片、下载 PDF 功能
 */

import { useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { m, AnimatePresence } from "framer-motion";
import { X, Download, FileText, Loader2, Lock, CheckCircle } from "lucide-react";
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

  // PDF 生成直接从 sessionStorage 读取完整数据
  const {
    isGenerating,
    hasShared,
    canDownloadPdf,
    saveShareCard,
    downloadPdf,
  } = useShareAndPdf({
    shareCardRef,
  });

  // 禁止背景滚动
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
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
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
                : "fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[440px] overflow-y-auto"
            }
            initial={isMobile ? { y: "100%" } : { opacity: 0, scale: 0.95, x: "-50%", y: "-50%" }}
            animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
            exit={isMobile ? { y: "100%" } : { opacity: 0, scale: 0.95, x: "-50%", y: "-50%" }}
            transition={isMobile ? { type: "spring", damping: 28, stiffness: 350 } : { duration: 0.2 }}
          >
            <div className={`bg-[#FAF8F5] ${isMobile ? "rounded-t-3xl pb-10" : "rounded-2xl shadow-2xl"}`}>
              {/* 顶部拖动条 */}
              {isMobile && <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-brand-charcoal/20" />}

              {/* 头部 */}
              <div className="sticky top-0 z-10 flex items-center justify-between bg-[#FAF8F5] px-5 py-4">
                <div>
                  <h3 className="font-serif text-lg text-brand-charcoal">保存与分享</h3>
                  <p className="mt-0.5 text-xs text-brand-charcoal/50">保存卡片后可下载完整 PDF 报告</p>
                </div>
                <button
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-charcoal/5 text-brand-charcoal/60 transition-colors hover:bg-brand-charcoal/10"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* 分享卡片预览 */}
              <div className="flex justify-center px-5 pb-5">
                <div className="overflow-hidden rounded-2xl shadow-lg">
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
              </div>

              {/* 操作按钮 */}
              <div className="space-y-3 px-5 pb-5">
                {/* 保存图片按钮 */}
                <button
                  onClick={saveShareCard}
                  disabled={isGenerating}
                  className={`flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-sm font-medium transition-all ${
                    hasShared
                      ? "bg-green-500 text-white"
                      : "bg-brand-gold text-white hover:bg-brand-gold/90"
                  } disabled:opacity-50`}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>正在生成...</span>
                    </>
                  ) : hasShared ? (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      <span>已保存，点击再次保存</span>
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      <span>保存分享卡片到相册</span>
                    </>
                  )}
                </button>

                {/* 下载 PDF 按钮 */}
                <button
                  onClick={downloadPdf}
                  disabled={!canDownloadPdf || isGenerating}
                  className={`flex w-full items-center justify-center gap-2 rounded-full border-2 py-3 text-sm font-medium transition-all ${
                    canDownloadPdf
                      ? "border-brand-charcoal/20 bg-white text-brand-charcoal hover:border-brand-charcoal/40"
                      : "border-brand-charcoal/10 bg-brand-charcoal/5 text-brand-charcoal/40"
                  }`}
                >
                  {canDownloadPdf ? (
                    <>
                      <FileText className="h-4 w-4" />
                      <span>下载完整 PDF 报告</span>
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4" />
                      <span>保存卡片后解锁 PDF 下载</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </m.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

