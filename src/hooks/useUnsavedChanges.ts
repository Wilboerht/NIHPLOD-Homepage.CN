"use client";

import { useCallback, useEffect } from "react";

/**
 * 未保存更改守卫
 *
 * - `beforeunload`：拦截刷新 / 关闭标签页 / 外链跳转
 * - `guard(action)`：包装站内导航动作（返回按钮等），dirty 时先 confirm
 */
export function useUnsavedChanges(isDirty: boolean, message = "当前修改尚未保存，确定要离开吗？") {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // 站内 Link（侧边栏、面包屑等）导航守卫：beforeunload 不会拦截 SPA 跳转。
  // 这是最后一道兜底，表单的取消/关闭按钮仍应使用 guard/confirmClose。
  useEffect(() => {
    if (!isDirty) return;
    const handleLinkClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target as Element | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }
      // 只拦截站内路径，外链交给 beforeunload / 浏览器
      if (!href.startsWith("/") || href.startsWith("//")) return;
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", handleLinkClick, true);
    return () => document.removeEventListener("click", handleLinkClick, true);
  }, [isDirty, message]);

  const guard = useCallback(
    <T>(action: () => T): T | undefined => {
      if (isDirty && typeof window !== "undefined" && !window.confirm(message)) {
        return undefined;
      }
      return action();
    },
    [isDirty, message]
  );

  const confirmClose = useCallback(() => {
    if (!isDirty) return true;
    if (typeof window === "undefined") return false;
    return window.confirm(message);
  }, [isDirty, message]);

  return { guard, confirmClose };
}
