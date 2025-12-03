"use client";

/**
 * 微信分享 Hook
 * 在微信浏览器中自动配置 JS-SDK 并设置分享内容
 */

import { useEffect, useState, useCallback } from "react";
import { isWechatBrowser, getDefaultShareImage, formatShareUrl } from "@/lib/wechat";

// ============================================
// 类型定义
// ============================================

/** 分享配置 */
export interface WechatShareConfig {
  /** 分享标题 */
  title: string;
  /** 分享描述 */
  desc: string;
  /** 分享链接 (默认当前页面) */
  link?: string;
  /** 分享图片 URL */
  imgUrl?: string;
}

/** Hook 返回值 */
export interface UseWechatShareReturn {
  /** 是否在微信浏览器中 */
  isWechat: boolean;
  /** SDK 是否就绪 */
  isReady: boolean;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 更新分享配置 */
  updateShare: (config: WechatShareConfig) => void;
}

// ============================================
// 全局状态
// ============================================

// 避免重复加载 SDK
let sdkLoaded = false;
let sdkLoading = false;

// ============================================
// SDK 加载
// ============================================

/**
 * 动态加载微信 JS-SDK
 */
function loadWechatSDK(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (sdkLoaded) {
      resolve();
      return;
    }

    if (sdkLoading) {
      // 等待加载完成
      const checkLoaded = setInterval(() => {
        if (sdkLoaded) {
          clearInterval(checkLoaded);
          resolve();
        }
      }, 100);
      return;
    }

    sdkLoading = true;

    const script = document.createElement("script");
    script.src = "https://res.wx.qq.com/open/js/jweixin-1.6.0.js";
    script.async = true;

    script.onload = () => {
      sdkLoaded = true;
      sdkLoading = false;
      resolve();
    };

    script.onerror = () => {
      sdkLoading = false;
      reject(new Error("微信 SDK 加载失败"));
    };

    document.head.appendChild(script);
  });
}

// ============================================
// Hook 实现
// ============================================

/**
 * 微信分享 Hook
 * 
 * @example
 * ```tsx
 * const { isWechat, isReady, updateShare } = useWechatShare({
 *   title: "NIHPLOD 旎柏",
 *   desc: "源自摩纳哥的高端护肤品牌",
 *   imgUrl: "/images/og-image.jpg",
 * });
 * ```
 */
export function useWechatShare(
  initialConfig?: WechatShareConfig
): UseWechatShareReturn {
  const [isWechat, setIsWechat] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<WechatShareConfig | undefined>(initialConfig);

  // 检测微信环境
  useEffect(() => {
    setIsWechat(isWechatBrowser());
  }, []);

  // 初始化 SDK
  useEffect(() => {
    if (!isWechat) return;

    const initSDK = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // 1. 加载 SDK
        await loadWechatSDK();

        // 2. 获取签名
        const currentUrl = window.location.href.split("#")[0];
        const response = await fetch(
          `/api/wechat/signature?url=${encodeURIComponent(currentUrl)}`
        );
        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error?.message || "获取签名失败");
        }

        // 3. 配置 SDK
        const wx = (window as WechatWindow).wx;
        if (!wx) {
          throw new Error("微信 SDK 未正确加载");
        }

        wx.config({
          debug: false,
          appId: result.data.appId,
          timestamp: result.data.timestamp,
          nonceStr: result.data.nonceStr,
          signature: result.data.signature,
          jsApiList: [
            "updateAppMessageShareData",
            "updateTimelineShareData",
            "onMenuShareAppMessage",
            "onMenuShareTimeline",
          ],
        });

        // 4. 等待就绪
        wx.ready(() => {
          setIsReady(true);
          setIsLoading(false);

          // 设置初始分享配置
          if (config) {
            updateShareConfig(wx, config);
          }
        });

        wx.error((res: { errMsg: string }) => {
          setError(`微信配置失败: ${res.errMsg}`);
          setIsLoading(false);
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "初始化失败");
        setIsLoading(false);
      }
    };

    initSDK();
  }, [isWechat]); // eslint-disable-line react-hooks/exhaustive-deps

  // 更新分享配置
  const updateShare = useCallback((newConfig: WechatShareConfig) => {
    setConfig(newConfig);

    if (!isReady) return;

    const wx = (window as WechatWindow).wx;
    if (wx) {
      updateShareConfig(wx, newConfig);
    }
  }, [isReady]);

  // 当配置变化时更新分享
  useEffect(() => {
    if (isReady && config) {
      const wx = (window as WechatWindow).wx;
      if (wx) {
        updateShareConfig(wx, config);
      }
    }
  }, [isReady, config]);

  return {
    isWechat,
    isReady,
    isLoading,
    error,
    updateShare,
  };
}

// ============================================
// 辅助函数
// ============================================

/**
 * 更新微信分享配置
 */
function updateShareConfig(wx: WechatSDK, config: WechatShareConfig): void {
  const shareData = {
    title: config.title,
    desc: config.desc,
    link: formatShareUrl(config.link || window.location.href),
    imgUrl: config.imgUrl || getDefaultShareImage(),
  };

  // 分享给朋友
  wx.updateAppMessageShareData({
    ...shareData,
    success: () => {},
  });

  // 分享到朋友圈
  wx.updateTimelineShareData({
    title: shareData.title,
    link: shareData.link,
    imgUrl: shareData.imgUrl,
    success: () => {},
  });
}

// ============================================
// 类型声明
// ============================================

interface WechatWindow extends Window {
  wx?: WechatSDK;
}

interface WechatSDK {
  config(options: {
    debug: boolean;
    appId: string;
    timestamp: number;
    nonceStr: string;
    signature: string;
    jsApiList: string[];
  }): void;
  ready(callback: () => void): void;
  error(callback: (res: { errMsg: string }) => void): void;
  updateAppMessageShareData(options: {
    title: string;
    desc: string;
    link: string;
    imgUrl: string;
    success?: () => void;
  }): void;
  updateTimelineShareData(options: {
    title: string;
    link: string;
    imgUrl: string;
    success?: () => void;
  }): void;
}

export default useWechatShare;

