"use client";

import { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect, ReactNode } from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";

type ToastType = "success" | "error" | "warning" | "info" | "loading";

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  /** >0 自动消失毫秒, 0 loading不消失, -1 标记退出动画中 */
  duration: number;
}

interface ToastOptions {
  type: ToastType;
  message: string;
  duration?: number; // 毫秒，默认 3000，loading 类型默认不自动消失
}

interface ToastContextType {
  toast: (options: ToastOptions) => string;
  success: (message: string, duration?: number) => string;
  error: (message: string, duration?: number) => string;
  warning: (message: string, duration?: number) => string;
  info: (message: string, duration?: number) => string;
  loading: (message: string) => string;
  dismiss: (id?: string) => void;
  update: (id: string, options: Partial<ToastOptions>) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

const iconMap = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
  loading: Loader2,
};

const typeStyles = {
  success: "bg-emerald-50 border-emerald-200 text-emerald-800",
  error: "bg-red-50 border-red-200 text-red-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
  info: "bg-blue-50 border-blue-200 text-blue-800",
  loading: "bg-[#FBF8F0] border-brand-beige text-brand-charcoal",
};

const iconStyles = {
  success: "text-emerald-500",
  error: "text-red-500",
  warning: "text-amber-500",
  info: "text-blue-500",
  loading: "text-brand-primary animate-spin",
};

/**
 * Toast 提供者组件
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const reduceMotion = useReducedMotion();

  const removeToast = useCallback(
    (id: string) => {
      const timer = timersRef.current.get(id);
      if (timer) {
        clearTimeout(timer);
        timersRef.current.delete(id);
      }
      // 标记为退出动画；reduceMotion 时立即移除，否则 300ms 后移除
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, duration: -1 } : t))
      );
      const delay = reduceMotion ? 0 : 300;
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, delay);
    },
    [reduceMotion]
  );

  const addToast = useCallback(
    (options: ToastOptions): string => {
      const id = Math.random().toString(36).substring(2, 9);
      const { type, message, duration } = options;

      // loading 类型默认不自动消失，其他类型默认 3000ms
      const finalDuration = duration ?? (type === "loading" ? 0 : 3000);

      const newToast: ToastItem = { id, message, type, duration: finalDuration };
      setToasts((prev) => [...prev, newToast]);

      if (finalDuration > 0) {
        const timer = setTimeout(() => {
          removeToast(id);
        }, finalDuration);
        timersRef.current.set(id, timer);
      }

      return id;
    },
    [removeToast]
  );

  const updateToast = useCallback(
    (id: string, options: Partial<ToastOptions>) => {
      setToasts((prev) =>
        prev.map((t) => {
          if (t.id === id) {
            const updated = {
              ...t,
              ...(options.message && { message: options.message }),
              ...(options.type && { type: options.type }),
            };

            // 始终清除旧定时器
            const oldTimer = timersRef.current.get(id);
            if (oldTimer) clearTimeout(oldTimer);

            // 非 loading 类型设置自动消失
            if (options.type && options.type !== "loading") {
              const duration = options.duration ?? 3000;
              const timer = setTimeout(() => removeToast(id), duration);
              timersRef.current.set(id, timer);
            } else if (options.type === "loading") {
              timersRef.current.delete(id);
            }

            return updated;
          }
          return t;
        })
      );
    },
    [removeToast]
  );

  const dismissAll = useCallback(() => {
    // 清除所有定时器
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current.clear();
    setToasts([]);
  }, []);

  // 组件卸载时清理所有定时器（防止内存泄漏 + setState on unmounted 警告）
  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  const dismiss = useCallback(
    (id?: string) => {
      if (id) {
        removeToast(id);
      } else {
        dismissAll();
      }
    },
    [removeToast, dismissAll]
  );

  const value = useMemo<ToastContextType>(() => ({
    toast: addToast,
    success: (message, duration) => addToast({ type: "success", message, duration }),
    error: (message, duration) => addToast({ type: "error", message, duration }),
    warning: (message, duration) => addToast({ type: "warning", message, duration }),
    info: (message, duration) => addToast({ type: "info", message, duration }),
    loading: (message) => addToast({ type: "loading", message }),
    dismiss,
    update: updateToast,
  }), [addToast, dismiss, updateToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast 容器 - 顶部居中显示 - 极高层级确保不被遮挡 */}
      <div className="fixed left-1/2 top-10 z-[100000] flex -translate-x-1/2 flex-col gap-2 md:top-16">
        <AnimatePresence>
          {toasts.map((toast) => {
            const Icon = iconMap[toast.type];
            const isRemoving = toast.duration === -1;
            return (
              <m.div
                key={toast.id}
                initial={reduceMotion ? false : { opacity: 0, y: -16, scale: 0.96 }}
                animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -8, scale: 0.96 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  "flex w-[min(280px,calc(100vw-2rem))] max-w-[400px] items-center gap-3 rounded-xl border px-4 py-3 shadow-lg",
                  typeStyles[toast.type]
                )}
                role="alert"
              >
                <Icon className={cn("h-5 w-5 flex-shrink-0", iconStyles[toast.type])} />
                <span className="flex-1 text-sm font-medium">{toast.message}</span>
                {toast.type !== "loading" && (
                  <button
                    onClick={() => removeToast(toast.id)}
                    className="ml-2 rounded p-0.5 opacity-70 transition-opacity hover:opacity-100"
                    aria-label="关闭"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </m.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

/**
 * 使用 Toast 的 Hook
 */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
