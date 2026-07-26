/**
 * UserCenterModal — 嵌入式用户中心弹窗
 *
 * 以 iframe 嵌入主站 /account/embed 精简版用户中心。
 * 通过 postMessage 与 iframe 通信，监听登出和撤销授权事件。
 */
"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useSSOContext } from "./useSSO";

// ============================================
// Types
// ============================================

export interface UserCenterModalProps {
  /** 是否显示弹窗 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 自定义 className */
  className?: string;
  /** 弹窗宽度 */
  width?: number;
  /** 弹窗高度 */
  height?: number;
}

// ============================================
// PostMessage Protocol
// ============================================

/**
 * iframe 发送给父窗口的消息
 */
interface IFrameMessage {
  type: "NIHPLOD_SSO_READY" | "NIHPLOD_SSO_LOGOUT" | "NIHPLOD_SSO_REVOKE" | "NIHPLOD_SSO_RESIZE";
  payload?: {
    height?: number;
    clientId?: string;
  };
}

// ============================================
// Component
// ============================================

/**
 * 用户中心弹窗组件
 *
 * ```tsx
 * function MyHeader() {
 *   const [showCenter, setShowCenter] = useState(false);
 *
 *   return (
 *     <>
 *       <button onClick={() => setShowCenter(true)}>用户中心</button>
 *       <UserCenterModal
 *         open={showCenter}
 *         onClose={() => setShowCenter(false)}
 *       />
 *     </>
 *   );
 * }
 * ```
 */
export function UserCenterModal({
  open,
  onClose,
  className,
  width = 480,
  height = 640,
}: UserCenterModalProps) {
  const { config, setUser, setAccessToken, setRefreshToken } = useSSOContext();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dynamicHeight, setDynamicHeight] = useState(height);

  const embedUrl = `${config.providerUrl}/account/embed`;

  // 监听来自 iframe 的 postMessage
  const handleMessage = useCallback((event: MessageEvent) => {
    // 安全检查：只接受来自主站的消息
    if (event.origin !== new URL(config.providerUrl).origin) {
      return;
    }

    const message = event.data as IFrameMessage;
    if (!message?.type) return;

    switch (message.type) {
      case "NIHPLOD_SSO_READY":
        setIframeLoaded(true);
        setError(null);
        break;

      case "NIHPLOD_SSO_LOGOUT":
        // 用户在 iframe 中点击登出
        setUser(null);
        setAccessToken(null);
        setRefreshToken(null);
        try {
          localStorage.removeItem("nihplod_sso_tokens");
        } catch {
          // noop
        }
        onClose();
        break;

      case "NIHPLOD_SSO_REVOKE":
        // 用户撤销了某个子项目的授权
        console.log("[SSO] 用户撤销授权:", message.payload?.clientId);
        break;

      case "NIHPLOD_SSO_RESIZE":
        // iframe 请求调整大小
        if (message.payload?.height) {
          const newHeight = Math.max(400, Math.min(900, message.payload.height));
          setDynamicHeight(newHeight);
        }
        break;
    }
  }, [config.providerUrl, setUser, setAccessToken, setRefreshToken, onClose]);

  useEffect(() => {
    if (!open) return;

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [open, handleMessage]);

  // 重置状态
  useEffect(() => {
    if (open) {
      setIframeLoaded(false);
      setError(null);
      setDynamicHeight(height);
    }
  }, [open, height]);

  // ESC 键关闭
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // 点击遮罩层关闭
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // iframe 加载失败
  const handleIframeError = () => {
    setError("加载用户中心失败，请稍后重试");
    setIframeLoaded(true);
  };

  if (!open) return null;

  return (
    <div
      className={`nihplod-sso-modal-overlay ${className || ""}`}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        animation: "nihplod-fade-in 0.2s ease",
      }}
      onClick={handleOverlayClick}
    >
      <div
        className="nihplod-sso-modal-container"
        style={{
          position: "relative",
          width: Math.min(width, window.innerWidth - 32),
          height: Math.min(dynamicHeight, window.innerHeight - 80),
          backgroundColor: "#ffffff",
          borderRadius: "12px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          overflow: "hidden",
          animation: "nihplod-slide-up 0.3s ease",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid #eee",
            backgroundColor: "#fafafa",
          }}
        >
          <span style={{ fontWeight: 600, fontSize: "15px", color: "#1a1a2e" }}>
            用户中心
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#666",
            }}
            aria-label="关闭"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body: iframe */}
        <div style={{ height: "calc(100% - 45px)", position: "relative" }}>
          {!iframeLoaded && !error && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#f9f9f9",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  border: "3px solid #e0e0e0",
                  borderTopColor: "#1a1a2e",
                  borderRadius: "50%",
                  animation: "nihplod-spin 0.8s linear infinite",
                }}
              />
              <style>{`@keyframes nihplod-spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {error && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#f9f9f9",
                gap: "12px",
              }}
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#e74c3c" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
              </svg>
              <p style={{ color: "#666", fontSize: "14px", margin: 0 }}>{error}</p>
              <button
                onClick={onClose}
                style={{
                  padding: "6px 16px",
                  borderRadius: "6px",
                  border: "1px solid #ddd",
                  backgroundColor: "#fff",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                关闭
              </button>
            </div>
          )}

          <iframe
            ref={iframeRef}
            src={embedUrl}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              opacity: iframeLoaded ? 1 : 0,
              transition: "opacity 0.3s ease",
            }}
            onLoad={() => setIframeLoaded(true)}
            onError={handleIframeError}
            title="用户中心"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        </div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes nihplod-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes nihplod-slide-up {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
