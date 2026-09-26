"use client";

import { useCallback, useEffect } from "react";

/**
 * 未保存更改守卫
 *
 * - `beforeunload`：拦截刷新 / 关闭标签页 / 外链跳转
 * - `guard(action)`：包装站内导航动作（返回按钮等），dirty 时先 confirm
 */
export function useUnsavedChanges(
  isDirty: boolean,
  message = "当前修改尚未保存，确定要离开吗？"
) {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const guard = useCallback(
    <T,>(action: () => T): T | undefined => {
      if (isDirty && typeof window !== "undefined" && !window.confirm(message)) {
        return undefined;
      }
      return action();
    },
    [isDirty, message]
  );

  return { guard };
}
