/**
 * AI 顾问行为分析 Hook
 * 
 * 提供统一的事件追踪接口，用于收集用户行为数据
 */

"use client";

import { useCallback, useEffect, useRef } from "react";

// 事件类型
type AnalyticsEvent = 
  | "session_start"
  | "questionnaire_start"
  | "questionnaire_complete"
  | "face_scan_start"
  | "face_scan_complete"
  | "face_scan_skip"
  | "analysis_start"
  | "analysis_complete"
  | "result_view"
  | "result_share";

// 会话ID存储键
const SESSION_ID_KEY = "advisor_session_id";

/**
 * 生成唯一会话ID
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 15);
  return `${timestamp}-${randomStr}`;
}

/**
 * 获取或创建会话ID
 */
function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  
  let sessionId = sessionStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = generateSessionId();
    sessionStorage.setItem(SESSION_ID_KEY, sessionId);
  }
  return sessionId;
}

/**
 * 获取UTM参数
 */
function getUtmParams(): Record<string, string> {
  if (typeof window === "undefined") return {};
  
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get("utm_source") || "",
    utm_medium: params.get("utm_medium") || "",
    utm_campaign: params.get("utm_campaign") || "",
  };
}

/**
 * 简单的浏览器指纹生成（非精确，仅用于统计去重）
 */
function generateFingerprint(): string {
  if (typeof window === "undefined") return "";
  
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  
  ctx.textBaseline = "top";
  ctx.font = "14px Arial";
  ctx.fillText("fingerprint", 2, 2);
  
  const data = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    canvas.toDataURL().slice(-50), // 取最后50字符
  ].join("|");
  
  // 简单哈希
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * 发送追踪事件
 */
async function sendTrackEvent(
  event: AnalyticsEvent, 
  data?: Record<string, unknown>
): Promise<void> {
  const sessionId = getOrCreateSessionId();
  if (!sessionId) return;
  
  try {
    // 使用 sendBeacon 确保页面关闭时也能发送
    const payload = JSON.stringify({
      sessionId,
      event,
      data,
      timestamp: new Date().toISOString(),
    });
    
    // 优先使用 sendBeacon，fallback 到 fetch
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/advisor/analytics/track",
        new Blob([payload], { type: "application/json" })
      );
    } else {
      await fetch("/api/advisor/analytics/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      });
    }
  } catch (error) {
    // 静默失败，不影响用户体验
    console.debug("Analytics track failed:", error);
  }
}

/**
 * AI 顾问分析 Hook
 */
export function useAdvisorAnalytics() {
  const initialized = useRef(false);
  
  // 初始化会话
  const initSession = useCallback(() => {
    if (initialized.current) return;
    initialized.current = true;
    
    const fingerprint = generateFingerprint();
    const utmParams = getUtmParams();
    
    sendTrackEvent("session_start", {
      fingerprint,
      ...utmParams,
    });
  }, []);
  
  // 追踪问卷开始
  const trackQuestionnaireStart = useCallback(() => {
    sendTrackEvent("questionnaire_start");
  }, []);
  
  // 追踪问卷完成
  const trackQuestionnaireComplete = useCallback((answers: Record<string, string | string[]>) => {
    sendTrackEvent("questionnaire_complete", { answers });
  }, []);
  
  // 追踪面部扫描开始
  const trackFaceScanStart = useCallback(() => {
    sendTrackEvent("face_scan_start");
  }, []);
  
  // 追踪面部扫描完成
  const trackFaceScanComplete = useCallback(() => {
    sendTrackEvent("face_scan_complete");
  }, []);
  
  // 追踪跳过面部扫描
  const trackFaceScanSkip = useCallback(() => {
    sendTrackEvent("face_scan_skip");
  }, []);
  
  // 追踪分析开始
  const trackAnalysisStart = useCallback(() => {
    sendTrackEvent("analysis_start");
  }, []);
  
  // 追踪分析完成
  const trackAnalysisComplete = useCallback((source: "ai" | "fallback") => {
    sendTrackEvent("analysis_complete", { source });
  }, []);
  
  // 追踪结果查看
  const trackResultView = useCallback(() => {
    sendTrackEvent("result_view");
  }, []);
  
  // 追踪结果分享
  const trackResultShare = useCallback((method: "image" | "link" | "weibo" | "native" | "wechat" | "xiaohongshu" | "douyin") => {
    sendTrackEvent("result_share", { method });
  }, []);
  
  // 获取当前会话ID
  const getSessionId = useCallback(() => {
    return getOrCreateSessionId();
  }, []);
  
  return {
    initSession,
    trackQuestionnaireStart,
    trackQuestionnaireComplete,
    trackFaceScanStart,
    trackFaceScanComplete,
    trackFaceScanSkip,
    trackAnalysisStart,
    trackAnalysisComplete,
    trackResultView,
    trackResultShare,
    getSessionId,
  };
}

/**
 * 便捷组件：自动初始化会话
 */
export function useAutoInitSession() {
  const { initSession } = useAdvisorAnalytics();
  
  useEffect(() => {
    initSession();
  }, [initSession]);
}

