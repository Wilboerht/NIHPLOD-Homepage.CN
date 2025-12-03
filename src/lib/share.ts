/**
 * 分享与保存工具
 */

import html2canvas from "html2canvas";

/** 分享平台 */
export type SharePlatform = "wechat" | "weibo" | "copy" | "native";

/** 分享数据 */
export interface ShareData {
  title: string;
  description: string;
  url: string;
  image?: string;
}

/**
 * 将元素转换为图片
 */
export async function elementToImage(
  element: HTMLElement,
  options?: {
    scale?: number;
    backgroundColor?: string;
    padding?: number;
  }
): Promise<string> {
  const { scale = 2, backgroundColor = "#FAF8F5", padding = 20 } = options || {};

  // 添加临时 padding
  const originalPadding = element.style.padding;
  element.style.padding = `${padding}px`;

  try {
    const canvas = await html2canvas(element, {
      scale,
      backgroundColor,
      useCORS: true,
      allowTaint: true,
      logging: false,
      // 忽略某些元素
      ignoreElements: (el) => {
        return el.classList.contains("no-screenshot");
      },
    });

    return canvas.toDataURL("image/png", 1.0);
  } finally {
    element.style.padding = originalPadding;
  }
}

/**
 * 下载图片到本地
 */
export function downloadImage(dataUrl: string, filename: string = "nihplod-skin-report.png"): void {
  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * 保存到相册（移动端尝试触发保存）
 */
export async function saveToGallery(dataUrl: string): Promise<boolean> {
  // 检查是否支持 Web Share API（移动端）
  if (navigator.share && navigator.canShare) {
    try {
      // 将 data URL 转换为 Blob
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const file = new File([blob], "nihplod-skin-report.png", { type: "image/png" });

      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "NIHPLOD 肌肤分析报告",
        });
        return true;
      }
    } catch (error) {
      console.warn("Share API failed:", error);
    }
  }

  // 降级到下载
  downloadImage(dataUrl);
  return true;
}

/**
 * 复制文本到剪贴板
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 降级方案
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    return success;
  }
}

/**
 * 生成分享链接
 */
export function generateShareUrl(baseUrl: string, params?: Record<string, string>): string {
  const url = new URL(baseUrl, window.location.origin);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  // 添加分享标记
  url.searchParams.set("shared", "1");

  return url.toString();
}

/**
 * 调用微博分享
 */
export function shareToWeibo(data: ShareData): void {
  const params = new URLSearchParams({
    url: data.url,
    title: `${data.title} - ${data.description}`,
  });

  if (data.image) {
    params.set("pic", data.image);
  }

  const weiboUrl = `https://service.weibo.com/share/share.php?${params.toString()}`;
  window.open(weiboUrl, "_blank", "width=600,height=500");
}

/**
 * 调用微信分享（显示二维码提示）
 */
export function shareToWechat(data: ShareData): { url: string; showQRHint: boolean } {
  // 微信分享需要在微信内打开，或者显示二维码让用户扫描
  // 这里返回分享链接和提示信息
  return {
    url: data.url,
    showQRHint: true,
  };
}

/**
 * 使用原生分享 API
 */
export async function shareNative(data: ShareData): Promise<boolean> {
  if (!navigator.share) {
    return false;
  }

  try {
    await navigator.share({
      title: data.title,
      text: data.description,
      url: data.url,
    });
    return true;
  } catch (error) {
    // 用户取消分享不算错误
    if ((error as Error).name === "AbortError") {
      return false;
    }
    throw error;
  }
}

/**
 * 统一分享入口
 */
export async function share(platform: SharePlatform, data: ShareData): Promise<boolean> {
  switch (platform) {
    case "native":
      return shareNative(data);

    case "weibo":
      shareToWeibo(data);
      return true;

    case "wechat":
      // 微信分享需要特殊处理
      const wechatResult = shareToWechat(data);
      if (wechatResult.showQRHint) {
        // 复制链接并提示用户
        await copyToClipboard(wechatResult.url);
      }
      return true;

    case "copy":
      return copyToClipboard(
        `${data.title}\n${data.description}\n\n${data.url}`
      );

    default:
      return false;
  }
}

/**
 * 检测分享能力
 */
export function getShareCapabilities(): {
  native: boolean;
  clipboard: boolean;
  download: boolean;
} {
  return {
    native: typeof navigator !== "undefined" && !!navigator.share,
    clipboard: typeof navigator !== "undefined" && !!navigator.clipboard,
    download: true, // 下载始终可用
  };
}

/**
 * 生成分享文案
 */
export function generateShareText(
  skinType: string,
  concerns: string[]
): { title: string; description: string } {
  const concernText = concerns.length > 0 ? concerns.slice(0, 2).join("、") : "日常护理";

  return {
    title: "我的 AI 肌肤分析报告 - NIHPLOD",
    description: `我是${skinType}，主要关注${concernText}。来测测你的肌肤状态吧！`,
  };
}

