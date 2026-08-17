/**
 * RequireAuth / withAuth — 路由保护组件
 *
 * 用法：
 * - <RequireAuth> 包裹需要登录才能访问的路由
 * - withAuth(Component) HOC 包装单个页面组件
 */

"use client";

import React, { useEffect, useRef, useState, type ComponentType } from "react";
import { useSso } from "./SsoProvider";

// ============================================
// RequireAuth 组件
// ============================================

export interface RequireAuthProps {
  /** 子组件（受保护的内容） */
  children: React.ReactNode;

  /** 未登录时的回退内容（默认显示加载中） */
  fallback?: React.ReactNode;

  /** 是否在检测到未登录时自动发起登录跳转 */
  autoLogin?: boolean;

  /**
   * 是否使用弹窗模式登录（保持当前页面状态不丢失）
   *
   * 仅在 autoLogin=true 时生效。弹窗被拦截时自动回退到同页重定向。
   */
  usePopup?: boolean;

  /**
   * 登录发起失败时的回调（如弹窗被关闭 popup_closed）。
   * 失败后组件会展示重试入口，不会永久停在"请先登录"。
   */
  onError?: (error: unknown) => void;

  /**
   * 自定义登录失败 UI。不传时显示默认的错误提示与"重试"按钮。
   * retry() 会重新发起登录。
   */
  renderLoginError?: (error: unknown, retry: () => void) => React.ReactNode;
}

/**
 * 路由保护组件
 *
 * 未登录时自动触发登录跳转或显示回退内容。
 * 登录发起失败（如弹窗被关闭）时显示重试入口，并通过 onError 上报。
 *
 * @example
 * ```tsx
 * // 弹窗模式：不中断用户当前操作
 * <RequireAuth autoLogin usePopup>
 *   <Dashboard />
 * </RequireAuth>
 * ```
 */
export function RequireAuth({
  children,
  fallback,
  autoLogin = true,
  usePopup = false,
  onError,
  renderLoginError,
}: RequireAuthProps) {
  const { isAuthenticated, isLoading, login, loginPopup } = useSso();
  const loginTriggeredRef = useRef(false);
  const [loginError, setLoginError] = useState<unknown>(null);

  const triggerLogin = () => {
    loginTriggeredRef.current = true;
    const currentPath = window.location.pathname + window.location.search;

    const handleFailure = (err: unknown) => {
      // 失败时重置触发标记，允许重试；否则组件会永久停在"请先登录"
      loginTriggeredRef.current = false;
      setLoginError(err);
      onError?.(err);
    };

    if (usePopup) {
      loginPopup({ returnUrl: currentPath }).catch((err) => {
        // 弹窗被拦截时回退到同页重定向
        if ((err as { code?: string }).code === "popup_blocked") {
          login(currentPath).catch(handleFailure);
          return;
        }
        // popup_closed 等其他错误：展示重试入口
        handleFailure(err);
      });
    } else {
      login(currentPath).catch(handleFailure);
    }
  };

  const retry = () => {
    setLoginError(null);
    triggerLogin();
  };

  useEffect(() => {
    if (!isLoading && !isAuthenticated && autoLogin && !loginTriggeredRef.current) {
      triggerLogin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isAuthenticated, autoLogin, usePopup, login, loginPopup]);

  if (isLoading) {
    return (
      fallback || React.createElement("div", null, "正在验证登录状态...")
    );
  }

  if (!isAuthenticated) {
    if (loginError) {
      if (renderLoginError) {
        return React.createElement(
          React.Fragment,
          null,
          renderLoginError(loginError, retry)
        );
      }
      const message =
        loginError instanceof Error ? loginError.message : "登录失败";
      return React.createElement(
        "div",
        null,
        React.createElement("p", null, `登录未完成：${message}`),
        React.createElement("button", { onClick: retry }, "重试登录")
      );
    }
    if (fallback) return React.createElement(React.Fragment, null, fallback);
    return React.createElement("div", null, "请先登录");
  }

  return React.createElement(React.Fragment, null, children);
}

// ============================================
// withAuth HOC
// ============================================

/**
 * 高阶组件：包装页面组件，要求认证后才能访问
 *
 * @example
 * ```tsx
 * function DashboardPage() { return <div>Dashboard</div>; }
 * export default withAuth(DashboardPage);
 * ```
 */
export function withAuth<P extends object>(
  Component: ComponentType<P>
): ComponentType<P> {
  const displayName =
    Component.displayName || Component.name || "Component";

  function WrappedComponent(props: P) {
    return React.createElement(
      RequireAuth,
      null,
      React.createElement(Component, props)
    );
  }

  WrappedComponent.displayName = `withAuth(${displayName})`;
  return WrappedComponent;
}
