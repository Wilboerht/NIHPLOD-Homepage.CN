"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "warning" | "info" | "loading";

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
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
  success: "bg-green-50 border-green-200 text-green-800",
  error: "bg-red-50 border-red-200 text-red-800",
  warning: "bg-yellow-50 border-yellow-200 text-yellow-800",
  info: "bg-blue-50 border-blue-200 text-blue-800",
  loading: "bg-brand-cream border-brand-beige text-brand-charcoal",
};

const iconStyles = {
  success: "text-green-500",
  error: "text-red-500",
  warning: "text-yellow-500",
  info: "text-blue-500",
  loading: "text-brand-gold animate-spin",
};

/**
 * Toast 提供者组件
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const removeToast = useCallback((id: string) => {
    // 清除定时器
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

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

            // 如果更新了类型且不是 loading，设置自动消失
            if (options.type && options.type !== "loading") {
              const duration = options.duration ?? 3000;
              // 清除旧定时器
              const oldTimer = timersRef.current.get(id);
              if (oldTimer) clearTimeout(oldTimer);
              // 设置新定时器
              const timer = setTimeout(() => removeToast(id), duration);
              timersRef.current.set(id, timer);
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

  const value: ToastContextType = {
    toast: addToast,
    success: (message, duration) => addToast({ type: "success", message, duration }),
    error: (message, duration) => addToast({ type: "error", message, duration }),
    warning: (message, duration) => addToast({ type: "warning", message, duration }),
    info: (message, duration) => addToast({ type: "info", message, duration }),
    loading: (message) => addToast({ type: "loading", message }),
    dismiss,
    update: updateToast,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast 容器 - 顶部居中显示 - 极高层级确保不被遮挡 */}
      <div className="fixed top-10 left-1/2 z-[100000] flex -translate-x-1/2 flex-col gap-2 md:top-16">
        {toasts.map((toast, index) => {
          const Icon = iconMap[toast.type];
          return (
            <div
              key={toast.id}
              className={cn(
                "flex min-w-[280px] max-w-[400px] items-center gap-3 rounded-xl border px-4 py-3 shadow-lg",
                "animate-in slide-in-from-top-4 fade-in duration-300",
                typeStyles[toast.type]
              )}
              style={{ zIndex: 100 + index }}
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
            </div>
          );
        })}
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

