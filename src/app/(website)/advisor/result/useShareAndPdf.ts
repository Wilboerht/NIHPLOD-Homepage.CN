"use client";

/**
 * 分享卡片截图和 PDF 生成 Hook
 * PDF 通过服务端 API 生成
 */

import { useState, useCallback, useRef, RefObject } from "react";
import html2canvas from "html2canvas";

interface ShareAndPdfOptions {
  shareCardRef: RefObject<HTMLDivElement | null>;
}

interface UseShareAndPdfReturn {
  isImageGenerating: boolean;
  isPdfGenerating: boolean;
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

/**
 * 等待元素内所有图片加载完成
 */
async function waitForImagesToLoad(element: HTMLElement): Promise<void> {
  const images = element.querySelectorAll("img");
  const promises = Array.from(images).map((img) => {
    if (img.complete && img.naturalHeight !== 0) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => {
        console.warn("Image failed to load:", img.src);
        resolve(); // 即使加载失败也继续
      };
    });
  });
  await Promise.all(promises);
}

export function useShareAndPdf(options: ShareAndPdfOptions): UseShareAndPdfReturn {
  const { shareCardRef } = options;

  const [isImageGenerating, setIsImageGenerating] = useState(false);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const [hasShared, setHasShared] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(SHARE_STATUS_KEY) === "true";
  });

  // 使用 ref 追踪 PDF 请求状态，避免重复请求
  const pdfRequestInFlight = useRef(false);

  const canDownloadPdf = hasShared;

  /**
   * 生成分享卡片图片
   */
  const generateShareImage = useCallback(async (): Promise<string | null> => {
    if (!shareCardRef.current) return null;

    try {
      // 等待所有图片加载完成
      await waitForImagesToLoad(shareCardRef.current);

      // 额外等待一小段时间确保渲染完成
      await new Promise((resolve) => setTimeout(resolve, 100));

      const canvas = await html2canvas(shareCardRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: false, // 改为 false，避免污染 canvas
        backgroundColor: "#FAF8F5",
        logging: false,
        imageTimeout: 15000, // 图片加载超时 15 秒
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
    setIsImageGenerating(true);

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
      setIsImageGenerating(false);
    }
  }, [generateShareImage]);

  /**
   * 下载 PDF 报告（服务端生成）
   */
  const downloadPdf = useCallback(async (): Promise<boolean> => {
    // 防止重复点击 - 使用 ref 确保只发送一次请求
    if (!canDownloadPdf || pdfRequestInFlight.current) {
      console.log("PDF request blocked: canDownloadPdf=", canDownloadPdf, "inFlight=", pdfRequestInFlight.current);
      return false;
    }

    pdfRequestInFlight.current = true;
    setIsPdfGenerating(true);

    // 保存当前请求的 controller，用于取消
    const controller = new AbortController();

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
        // 传递定位授权状态，用于决定是否生成地理位置相关的内容
        locationConsent: sessionStorage.getItem("locationConsent") || undefined,
        // 传递用户手动选择的地区（如果有）
        userRegion: sessionStorage.getItem("userRegion") || undefined,
      };

      // 序列化 JSON - 确保正确处理中文
      const jsonBody = JSON.stringify(data);
      console.log("Sending PDF request, body length:", jsonBody.length);

      // 设置超时
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 120秒超时

      // 调用服务端 API 生成 PDF
      const response = await fetch("/api/advisor/pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
        body: jsonBody,
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
      setIsPdfGenerating(false);
      // 延迟重置 inFlight 状态，防止快速连续点击
      setTimeout(() => {
        pdfRequestInFlight.current = false;
      }, 1000);
    }
  }, [canDownloadPdf]);

  return {
    isImageGenerating,
    isPdfGenerating,
    hasShared,
    canDownloadPdf,
    generateShareImage,
    saveShareCard,
    downloadPdf,
  };
}

