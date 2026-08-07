"use client";

import { ReactNode, useEffect, useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
}

/**
 * 通用模态框组件
 * - 使用 Portal 渲染到 body，避免被父容器的层叠上下文影响
 * - framer-motion 进出场动画（遮罩淡入 + 内容缩放淡入）
 * - 焦点陷阱：打开时聚焦弹窗、Tab 循环、关闭时还原焦点
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
  closeOnBackdrop = true,
  closeOnEscape = true,
  showCloseButton = true,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const closeOnEscapeRef = useRef(closeOnEscape);
  const [mounted, setMounted] = useState(false);
  const wasOpenRef = useRef(false);

  // 保持最新回调（避免 effect 因内联 onClose 重跑）
  onCloseRef.current = onClose;
  closeOnEscapeRef.current = closeOnEscape;

  // 确保在客户端渲染（SSR 时 document.body 不可用）
  useEffect(() => {
    setMounted(true);
  }, []);

  // 处理 ESC 键关闭 + Tab 焦点循环（ref 稳定化，不依赖 onClose 引用）
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (closeOnEscapeRef.current && event.key === "Escape") {
      onCloseRef.current();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    // 收集弹窗内可聚焦元素
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    // Tab 循环：在最后一个元素时回到第一个，反之亦然
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  // open 状态变化：记录/还原焦点 + 滚动锁（仅在 false→true / true→false 时触发）
  useEffect(() => {
    if (open) {
      if (!wasOpenRef.current) {
        previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
      }
      wasOpenRef.current = true;
      document.body.style.overflow = "hidden";
      document.addEventListener("keydown", handleKeyDown);
    } else {
      if (wasOpenRef.current) {
        if (previouslyFocusedRef.current?.isConnected) {
          previouslyFocusedRef.current.focus();
        }
        previouslyFocusedRef.current = null;
      }
      wasOpenRef.current = false;
      // Only restore body scroll when no other open modals exist
      const otherModalOpen = document.querySelector('[aria-modal="true"]');
      if (!otherModalOpen) {
        document.body.style.overflow = "unset";
      }
      document.removeEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "unset";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, handleKeyDown]);

  // 打开后聚焦弹窗内目标元素（优先 autoFocus / data-autofocus，否则第一个可聚焦元素）
  useEffect(() => {
    if (open && dialogRef.current) {
      const autofocusEl = dialogRef.current.querySelector<HTMLElement>(
        '[autofocus], [data-autofocus]'
      );
      if (autofocusEl) {
        autofocusEl.focus();
        return;
      }
      const focusable = dialogRef.current.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      focusable?.focus();
    }
  }, [open]);

  const sizeStyles = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
    full: "max-w-6xl",
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 md:p-8">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={closeOnBackdrop ? onClose : undefined}
            aria-hidden="true"
          />

          {/* Modal Content */}
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? "modal-title" : undefined}
            aria-describedby={description ? "modal-description" : undefined}
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className={cn(
              "relative z-10 w-full rounded-xl bg-white shadow-2xl",
              "flex max-h-[calc(100dvh-2rem)] flex-col sm:max-h-[calc(100dvh-3rem)] md:max-h-[calc(100dvh-4rem)]",
              sizeStyles[size]
            )}
          >
            {/* Header */}
            {(title || showCloseButton) && (
              <div className="flex shrink-0 items-start justify-between border-b border-brand-charcoal/10 px-4 py-3 sm:px-6 sm:py-4">
                <div>
                  {title && (
                    <h2 id="modal-title" className="text-base font-semibold text-brand-charcoal sm:text-lg">
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p id="modal-description" className="mt-1 text-sm text-brand-charcoal/50">
                      {description}
                    </p>
                  )}
                </div>
                {showCloseButton && (
                  <button
                    onClick={onClose}
                    className="rounded-lg p-1 text-brand-charcoal/50 transition-colors hover:bg-brand-charcoal/[0.06] hover:text-brand-charcoal"
                    aria-label="关闭"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}
              </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
