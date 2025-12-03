"use client";

/**
 * ToastProvider - 重新导出自 Toast 组件
 *
 * 用法:
 * 1. 在 layout 中包裹 ToastProvider
 * 2. 在组件中使用 useToast hook
 *
 * ```tsx
 * // layout.tsx
 * import { ToastProvider } from "@/components/providers/ToastProvider";
 * <ToastProvider>{children}</ToastProvider>
 *
 * // 组件中
 * import { useToast } from "@/hooks";
 * const { success, error, loading, dismiss } = useToast();
 * success("操作成功！");
 * ```
 */
export { ToastProvider, useToast } from "../ui/Toast";
