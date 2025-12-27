"use client";

/**
 * 分享卡片截图和 PDF 生成 Hook
 * PDF 通过服务端 API 生成
 */

import { useState, useCallback, RefObject } from "react";
import html2canvas from "html2canvas";

interface ShareAndPdfOptions {
  shareCardRef: RefObject<HTMLDivElement | null>;
}

interface UseShareAndPdfReturn {
  isGenerating: boolean;
  hasShared: boolean;
  canDownloadPdf: boolean;
  generateShareImage: () => Promise<string | null>;
  saveShareCard: () => Promise<boolean>;
  downloadPdf: () => Promise<boolean>;
}

// localStorage key
const SHARE_STATUS_KEY = "nihplod_advisor_shared";

/** 从 sessionStorage 读取分析结果 */
function getAdvisorResult() {
  if (typeof window === "undefined") return null;
  const resultStr = sessionStorage.getItem("advisorResult");
  if (!resultStr) return null;
  try {
    return JSON.parse(resultStr);
  } catch {
    return null;
  }
}

/** 从 sessionStorage 读取面部分析结果 */
function getFaceAnalysis() {
  if (typeof window === "undefined") return null;
  const faceStr = sessionStorage.getItem("advisorFaceAnalysis");
  if (!faceStr) return null;
  try {
    return JSON.parse(faceStr);
  } catch {
    return null;
  }
}

export function useShareAndPdf(options: ShareAndPdfOptions): UseShareAndPdfReturn {
  const { shareCardRef } = options;

  const [isGenerating, setIsGenerating] = useState(false);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const [hasShared, setHasShared] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(SHARE_STATUS_KEY) === "true";
  });

  const canDownloadPdf = hasShared;

  /**
   * 生成分享卡片图片
   */
  const generateShareImage = useCallback(async (): Promise<string | null> => {
    if (!shareCardRef.current) return null;

    try {
      const canvas = await html2canvas(shareCardRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#FAF8F5",
      });

      return canvas.toDataURL("image/png");
    } catch (error) {
      console.error("Failed to generate share image:", error);
      return null;
    }
  }, [shareCardRef]);

  /**
   * 保存分享卡片到相册
   */
  const saveShareCard = useCallback(async (): Promise<boolean> => {
    setIsGenerating(true);

    try {
      const imageUrl = await generateShareImage();
      if (!imageUrl) {
        throw new Error("Failed to generate image");
      }

      // 尝试使用 Web Share API（移动端）
      if (navigator.share && navigator.canShare) {
        try {
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          const file = new File([blob], "nihplod-skin-report.png", { type: "image/png" });

          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: "NIHPLOD 肌肤分析报告",
            });
            // 标记已分享
            localStorage.setItem(SHARE_STATUS_KEY, "true");
            setHasShared(true);
            return true;
          }
        } catch (shareError) {
          console.warn("Share API failed:", shareError);
        }
      }

      // 降级到下载
      const link = document.createElement("a");
      link.download = "nihplod-skin-report.png";
      link.href = imageUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // 标记已分享
      localStorage.setItem(SHARE_STATUS_KEY, "true");
      setHasShared(true);
      return true;
    } catch (error) {
      console.error("Failed to save share card:", error);
      return false;
    } finally {
      setIsGenerating(false);
    }
  }, [generateShareImage]);

  /**
   * 下载 PDF 报告（服务端生成）
   */
  const downloadPdf = useCallback(async (): Promise<boolean> => {
    // 防止重复点击 - 使用独立的 PDF 生成状态
    if (!canDownloadPdf || isPdfGenerating) return false;

    setIsGenerating(true);
    setIsPdfGenerating(true);

    try {
      // 从 sessionStorage 读取数据
      const result = getAdvisorResult();
      const faceAnalysis = getFaceAnalysis();
      if (!result) {
        throw new Error("No analysis result found");
      }

      // 准备发送给 API 的数据
      const data = {
        skinType: result.skinAnalysis?.skinType || "combination",
        skinTypeLabel: result.skinAnalysis?.skinTypeLabel || "混合性肌肤",
        skinTypeDescription: faceAnalysis?.skinType?.description,
        skinTypeConfidence: faceAnalysis?.skinType?.confidence,
        skinAge: faceAnalysis?.skinAge?.estimated || result.skinAnalysis?.skinAge,
        skinAgeFactors: faceAnalysis?.skinAge?.factors,
        hydration: faceAnalysis?.hydration,
        overallScore: faceAnalysis?.overallScore,
        priorityAreas: faceAnalysis?.priorityAreas,
        dimensions: faceAnalysis?.dimensions || [],
        skinConditions: faceAnalysis?.skinConditions || [],
        concerns: result.skinAnalysis?.concerns || [],
        summary: result.skinAnalysis?.summary || "",
        details: result.skinAnalysis?.details || [],
        recommendations: faceAnalysis?.recommendations || [],
      };

      // 使用 AbortController 防止重复请求
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时

      // 调用服务端 API 生成 PDF
      const response = await fetch("/api/advisor/pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(data),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(`PDF generation failed: ${response.status} - ${errorText}`);
      }

      // 下载 PDF
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "NIHPLOD-肌肤分析报告.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      return true;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.error("PDF generation timed out");
      } else {
        console.error("Failed to generate PDF:", error);
      }
      return false;
    } finally {
      setIsGenerating(false);
      setIsPdfGenerating(false);
    }
  }, [canDownloadPdf, isPdfGenerating]);

  return {
    isGenerating,
    hasShared,
    canDownloadPdf,
    generateShareImage,
    saveShareCard,
    downloadPdf,
  };
}

