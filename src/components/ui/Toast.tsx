"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  useSyncExternalStore,
  ReactNode,
} from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { getApiErrorMessage } from "@/lib/api-client";

type ToastType = "success" | "error" | "warning" | "info" | "loading";

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  /** >0 自动消失毫秒；0 常驻；-1 退出动画中 */
  duration: number;
  createdAt: number;
}

interface ToastOptions {
  type: ToastType;
  message: string;
  /** 毫秒；0 表示常驻。不传时按类型使用默认值 */
  duration?: number;
}

interface ToastPromiseMessages<T> {
  loading: string;
  success: string | ((value: T) => string);
  error: string | ((error: unknown) => string);
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
  /** 用 loading toast 包裹异步任务，自动转为 success/error */
  promise: <T>(task: Promise<T>, messages: ToastPromiseMessages<T>) => Promise<T>;
  /** 统一提取 API 错误文案并弹出 error toast */
  apiError: (error: unknown, fallback?: string) => string;
}

const ToastContext = createContext<ToastContextType | null>(null);

const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 3000,
  info: 4000,
  warning: 6000,
  error: 8000,
  loading: 0,
};

const MAX_TOASTS = 3;
const DUPLICATE_WINDOW_MS = 2000;

/** Toast 位置只需感知首屏是否管理端；路由切换不改变 admin/website 边界 */
const subscribeToLocation = () => () => {};

const iconMap = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
  loading: Loader2,
};

const typeStyles: Record<ToastType, string> = {
  success: "bg-status-success-soft border-status-success-line text-status-success-fg",
  error: "bg-status-danger-soft border-status-danger-line text-status-danger-fg",
  warning: "bg-status-warning-soft border-status-warning-line text-status-warning-fg",
  info: "bg-status-info-soft border-status-info-line text-status-info-fg",
  loading: "bg-surface border-line text-ink",
};

const iconStyles: Record<ToastType, string> = {
  success: "text-status-success-fg",
  error: "text-status-danger-fg",
  warning: "text-status-warning-fg",
  info: "text-status-info-fg",
  loading: "text-brand-primary animate-spin",
};

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Toast 提供者组件
 * - admin 桌面：右上角页头操作区下方；admin 移动：sticky 顶栏下方全宽
 * - 官网保持顶部居中
 * - 类型化时长、去重、最多 3 条、hover/focus 暂停
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastsRef = useRef<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const startedAtRef = useRef<Map<string, number>>(new Map());
  const remainingRef = useRef<Map<string, number>>(new Map());
  const pausedRef = useRef(false);
  const reduceMotion = useReducedMotion();
  const pathname = useSyncExternalStore(
    subscribeToLocation,
    () => window.location.pathname,
    () => null
  );
  const isDesktop = useIsDesktop();
  const isAdminPath = pathname === "/admin" || Boolean(pathname?.startsWith("/admin/"));
  const slideFromSide = isAdminPath && isDesktop;

  useEffect(() => {
    toastsRef.current = toasts;
  }, [toasts]);

  const clearTimer = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const removeToast = useCallback(
    (id: string) => {
      clearTimer(id);
      startedAtRef.current.delete(id);
      remainingRef.current.delete(id);
      // 标记为退出动画；reduceMotion 时立即移除，否则 300ms 后移除
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, duration: -1 } : t)));
      const delay = reduceMotion ? 0 : 300;
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, delay);
    },
    [clearTimer, reduceMotion]
  );

  const scheduleRemoval = useCallback(
    (id: string, duration: number) => {
      clearTimer(id);
      remainingRef.current.set(id, duration);
      if (duration <= 0) return;
      if (pausedRef.current) return;
      startedAtRef.current.set(id, Date.now());
      const timer = setTimeout(() => removeToast(id), duration);
      timersRef.current.set(id, timer);
    },
    [clearTimer, removeToast]
  );

  const addToast = useCallback(
    (options: ToastOptions): string => {
      const { type, message } = options;
      const finalDuration = options.duration ?? DEFAULT_DURATION[type];
      const now = Date.now();

      // 相同 type + message 在 2 秒内去重，保留原位置并重置计时
      const existing = toastsRef.current.find(
        (item) =>
          item.type === type &&
          item.message === message &&
          item.duration !== -1 &&
          now - item.createdAt < DUPLICATE_WINDOW_MS
      );
      if (existing) {
        scheduleRemoval(existing.id, finalDuration);
        return existing.id;
      }

      const id = createId();
      const newToast: ToastItem = { id, message, type, duration: finalDuration, createdAt: now };
      const next = [newToast, ...toastsRef.current].slice(0, MAX_TOASTS);
      const overflow = [newToast, ...toastsRef.current].slice(MAX_TOASTS);
      overflow.forEach((item) => {
        clearTimer(item.id);
        startedAtRef.current.delete(item.id);
        remainingRef.current.delete(item.id);
      });
      toastsRef.current = next;
      setToasts(next);
      scheduleRemoval(id, finalDuration);
      return id;
    },
    [clearTimer, scheduleRemoval]
  );

  const updateToast = useCallback(
    (id: string, options: Partial<ToastOptions>) => {
      setToasts((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          const nextType = options.type ?? item.type;
          const nextDuration =
            options.type !== undefined
              ? (options.duration ?? DEFAULT_DURATION[nextType])
              : item.duration;
          const updated: ToastItem = {
            ...item,
            ...(options.message ? { message: options.message } : {}),
            type: nextType,
            duration: nextDuration,
          };
          scheduleRemoval(id, nextDuration);
          return updated;
        })
      );
    },
    [scheduleRemoval]
  );

  const pauseTimers = useCallback(() => {
    if (pausedRef.current) return;
    pausedRef.current = true;
    const now = Date.now();
    timersRef.current.forEach((timer, id) => {
      clearTimeout(timer);
      const startedAt = startedAtRef.current.get(id) ?? now;
      const remaining = remainingRef.current.get(id) ?? 0;
      remainingRef.current.set(id, Math.max(0, remaining - (now - startedAt)));
    });
    timersRef.current.clear();
  }, []);

  const resumeTimers = useCallback(() => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    toastsRef.current.forEach((item) => {
      const remaining = remainingRef.current.get(item.id) ?? 0;
      if (item.duration > 0 && remaining > 0) {
        scheduleRemoval(item.id, remaining);
      }
    });
  }, [scheduleRemoval]);

  const dismissAll = useCallback(() => {
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current.clear();
    startedAtRef.current.clear();
    remainingRef.current.clear();
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

  const promise = useCallback(
    async <T,>(task: Promise<T>, messages: ToastPromiseMessages<T>): Promise<T> => {
      const id = addToast({ type: "loading", message: messages.loading });
      try {
        const value = await task;
        updateToast(id, {
          type: "success",
          message:
            typeof messages.success === "function" ? messages.success(value) : messages.success,
        });
        return value;
      } catch (error) {
        updateToast(id, {
          type: "error",
          message: typeof messages.error === "function" ? messages.error(error) : messages.error,
        });
        throw error;
      }
    },
    [addToast, updateToast]
  );

  const apiError = useCallback(
    (error: unknown, fallback?: string) => {
      return addToast({ type: "error", message: getApiErrorMessage(error, fallback) });
    },
    [addToast]
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  // Esc 关闭最上层 toast
  useEffect(() => {
    if (toasts.length === 0) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      removeToast(toasts[0].id);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [toasts, removeToast]);

  const value = useMemo<ToastContextType>(
    () => ({
      toast: addToast,
      success: (message, duration) => addToast({ type: "success", message, duration }),
      error: (message, duration) => addToast({ type: "error", message, duration }),
      warning: (message, duration) => addToast({ type: "warning", message, duration }),
      info: (message, duration) => addToast({ type: "info", message, duration }),
      loading: (message) => addToast({ type: "loading", message }),
      dismiss,
      update: updateToast,
      promise,
      apiError,
    }),
    [addToast, dismiss, updateToast, promise, apiError]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className={cn(
          "pointer-events-none fixed z-toast flex flex-col gap-2",
          isAdminPath
            ? "left-4 right-4 top-[calc(3.5rem+env(safe-area-inset-top,0px)+0.5rem)] items-stretch lg:left-auto lg:right-6 lg:top-24 lg:w-[360px] lg:items-end"
            : "left-1/2 top-10 w-[min(360px,calc(100vw-2rem))] -translate-x-1/2 items-center md:top-16"
        )}
      >
        <AnimatePresence>
          {toasts.map((toast) => {
            const Icon = iconMap[toast.type];
            return (
              <m.div
                key={toast.id}
                initial={
                  reduceMotion
                    ? false
                    : { opacity: 0, x: slideFromSide ? 16 : 0, y: slideFromSide ? 0 : -16, scale: 0.98 }
                }
                animate={reduceMotion ? undefined : { opacity: 1, x: 0, y: 0, scale: 1 }}
                exit={
                  reduceMotion
                    ? undefined
                    : { opacity: 0, x: slideFromSide ? 16 : 0, y: slideFromSide ? 0 : -8, scale: 0.98 }
                }
                transition={{ duration: 0.2 }}
                className={cn(
                  "pointer-events-auto flex w-full items-start gap-3 rounded-surface border px-4 py-3 shadow-popover",
                  typeStyles[toast.type]
                )}
                role={toast.type === "error" ? "alert" : "status"}
                aria-live={toast.type === "error" ? "assertive" : "polite"}
                aria-atomic="true"
                onMouseEnter={pauseTimers}
                onMouseLeave={resumeTimers}
                onFocusCapture={pauseTimers}
                onBlurCapture={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    resumeTimers();
                  }
                }}
              >
                <Icon className={cn("mt-0.5 h-5 w-5 flex-shrink-0", iconStyles[toast.type])} />
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm font-medium leading-relaxed">
                  {toast.message}
                </span>
                {toast.type !== "loading" && (
                  <button
                    type="button"
                    onClick={() => removeToast(toast.id)}
                    className="-mr-2 -mt-1 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full opacity-70 transition-opacity hover:bg-black/5 hover:opacity-100 sm:h-8 sm:w-8"
                    aria-label="关闭通知"
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
