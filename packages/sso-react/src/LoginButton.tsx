/**
 * LoginButton — SSO 登录按钮组件
 *
 * 点击后重定向用户到主站授权页面完成 SSO 登录。
 * 支持多种样式变体（primary / secondary / outline）。
 */
"use client";

import React from "react";
import { useSSO } from "./useSSO";

// ============================================
// Types
// ============================================

export interface LoginButtonProps {
  /** 按钮样式变体 */
  variant?: "primary" | "secondary" | "outline";
  /** 按钮尺寸 */
  size?: "sm" | "md" | "lg";
  /** 自定义 className */
  className?: string;
  /** 按钮文案（默认：使用 NIHPLOD SSO 登录） */
  label?: string;
  /** 加载中文案 */
  loadingLabel?: string;
  /** 点击回调（在跳转前触发） */
  onClick?: () => void;
  /** 是否禁用 */
  disabled?: boolean;
}

// ============================================
// Style Maps
// ============================================

const variantStyles: Record<string, React.CSSProperties> = {
  primary: {
    backgroundColor: "#1a1a2e",
    color: "#ffffff",
    border: "none",
  },
  secondary: {
    backgroundColor: "#f0f0f5",
    color: "#1a1a2e",
    border: "none",
  },
  outline: {
    backgroundColor: "transparent",
    color: "#1a1a2e",
    border: "1.5px solid #1a1a2e",
  },
};

const sizeStyles: Record<string, React.CSSProperties> = {
  sm: {
    padding: "6px 14px",
    fontSize: "13px",
    borderRadius: "6px",
  },
  md: {
    padding: "10px 22px",
    fontSize: "15px",
    borderRadius: "8px",
  },
  lg: {
    padding: "14px 30px",
    fontSize: "17px",
    borderRadius: "10px",
  },
};

// ============================================
// Component
// ============================================

/**
 * SSO 登录按钮
 *
 * ```tsx
 * <LoginButton
 *   variant="primary"
 *   size="md"
 *   label="使用 NIHPLOD 账号登录"
 * />
 * ```
 */
export function LoginButton({
  variant = "primary",
  size = "md",
  className,
  label = "使用 NIHPLOD SSO 登录",
  loadingLabel = "跳转中...",
  onClick,
  disabled = false,
}: LoginButtonProps) {
  const { isLoggedIn, isLoading, user, login, logout } = useSSO();
  const [isRedirecting, setIsRedirecting] = React.useState(false);

  const handleClick = () => {
    if (disabled || isRedirecting) return;

    onClick?.();

    if (isLoggedIn) {
      // 已登录状态：点击可登出
      logout();
    } else {
      setIsRedirecting(true);
      login();
    }
  };

  // 已登录：显示用户信息下拉入口
  if (isLoggedIn && user) {
    const initials = user.nickname?.[0] || user.sub?.[0] || "?";
    const displayName = user.nickname || `用户 ${user.sub?.slice(-4)}`;

    return (
      <div
        className={`nihplod-sso-logged-in ${className || ""}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          cursor: "pointer",
          ...variantStyles[variant],
          ...sizeStyles[size],
        }}
        onClick={handleClick}
        title="点击登出"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
      >
        {user.avatar ? (
          <img
            src={user.avatar}
            alt={displayName}
            style={{
              width: size === "sm" ? 20 : 24,
              height: size === "sm" ? 20 : 24,
              borderRadius: "50%",
              objectFit: "cover",
            }}
          />
        ) : (
          <span
            style={{
              width: size === "sm" ? 20 : 24,
              height: size === "sm" ? 20 : 24,
              borderRadius: "50%",
              backgroundColor: variant === "primary" ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "12px",
              fontWeight: 600,
            }}
          >
            {initials}
          </span>
        )}
        <span style={{ fontWeight: 500 }}>{displayName}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
          <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  // 未登录：显示登录按钮
  return (
    <button
      className={`nihplod-sso-login-btn ${className || ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        cursor: isRedirecting ? "wait" : "pointer",
        fontWeight: 600,
        transition: "all 0.2s ease",
        opacity: disabled || isRedirecting ? 0.6 : 1,
        ...variantStyles[variant],
        ...sizeStyles[size],
      }}
      onClick={handleClick}
      disabled={disabled || isRedirecting}
    >
      {isRedirecting ? (
        <>
          {/* Loading spinner */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            style={{ animation: "nihplod-spin 1s linear infinite" }}
          >
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
            <path
              d="M12 2a10 10 0 0 1 10 10"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          {loadingLabel}
          <style>{`@keyframes nihplod-spin { to { transform: rotate(360deg); } }`}</style>
        </>
      ) : (
        <>
          {/* NIHPLOD logo icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="2" />
            <path d="M7 12h10M12 7v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}
