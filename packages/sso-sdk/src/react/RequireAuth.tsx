/**
 * RequireAuth / withAuth — 路由保护组件
 *
 * 用法：
 * - <RequireAuth> 包裹需要登录才能访问的路由
 * - withAuth(Component) HOC 包装单个页面组件
 */

"use client";

import React, { useEffect, useRef, type ComponentType } from "react";
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
}

/**
 * 路由保护组件
 *
 * 未登录时自动触发登录跳转或显示回退内容。
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
}: RequireAuthProps) {
  const { isAuthenticated, isLoading, login, loginPopup } = useSso();
  const loginTriggeredRef = useRef(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && autoLogin && !loginTriggeredRef.current) {
      loginTriggeredRef.current = true;
      const currentPath = window.location.pathname + window.location.search;

      if (usePopup) {
        loginPopup({ returnUrl: currentPath }).catch((err) => {
          // 弹窗被拦截时回退到同页重定向
          if ((err as { code?: string }).code === "popup_blocked") {
            login(currentPath);
          }
        });
      } else {
        login(currentPath);
      }
    }
  }, [isLoading, isAuthenticated, autoLogin, usePopup, login, loginPopup]);

  if (isLoading) {
    return (
      fallback || React.createElement("div", null, "正在验证登录状态...")
    );
  }

  if (!isAuthenticated) {
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
