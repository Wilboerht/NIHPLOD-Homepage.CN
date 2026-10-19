"use client";

import { ReactNode, RefObject, useEffect, useCallback, useId, useRef } from "react";
import { useMounted } from "@/hooks/useMounted";
import { useScrollLock } from "@/hooks/useScrollLock";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 模块级弹窗栈（记录当前挂载中的弹窗 useId）
 * 仅栈顶弹窗响应 Esc/遮罩，避免嵌套弹窗被一次全部关闭。
 */
const modalStack: string[] = [];
const modalElements = new Map<string, HTMLElement>();
let appRootLocked = false;
let appRootWasInert = false;
let appRootAriaHidden: string | null = null;

function syncModalStack() {
  const appRoot = document.getElementById("app-root");
  const hasModal = modalStack.length > 0;

  if (hasModal && appRoot && !appRootLocked) {
    appRootWasInert = appRoot.hasAttribute("inert");
    appRootAriaHidden = appRoot.getAttribute("aria-hidden");
    appRoot.setAttribute("inert", "");
    appRoot.setAttribute("aria-hidden", "true");
    appRootLocked = true;
  } else if (!hasModal && appRootLocked) {
    if (appRoot) {
      if (!appRootWasInert) appRoot.removeAttribute("inert");
      if (appRootAriaHidden === null) appRoot.removeAttribute("aria-hidden");
      else appRoot.setAttribute("aria-hidden", appRootAriaHidden);
    }
    appRootLocked = false;
  }

  const topId = modalStack[modalStack.length - 1];
  modalElements.forEach((element, id) => {
    const backdrop = element.parentElement?.querySelector<HTMLElement>("[data-modal-backdrop]");

    if (id === topId) {
      element.removeAttribute("inert");
      element.removeAttribute("aria-hidden");
      element.setAttribute("aria-modal", "true");
      backdrop?.removeAttribute("data-behind");
    } else {
      element.setAttribute("inert", "");
      element.setAttribute("aria-hidden", "true");
      element.setAttribute("aria-modal", "false");
      backdrop?.setAttribute("data-behind", "true");
    }
  });
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true"
  );
}

type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  size?: ModalSize;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  /** 弹窗形态：center 居中弹窗（默认）/ drawer 右侧抽屉 */
  variant?: "center" | "drawer";
  /** 无 title 时提供给读屏的对话框名称 */
  ariaLabel?: string;
  /** 固定底部操作区（不随内容滚动） */
  footer?: ReactNode;
  /** 关闭前守卫：返回 false 阻止关闭（X / Esc / 遮罩统一生效） */
  closeGuard?: () => boolean;
  /** 打开后优先聚焦的元素 */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * 弹窗/抽屉组件
 * - Portal 渲染到 body，避免被父容器层叠上下文影响
 * - framer-motion 进出场动画
 * - 焦点陷阱：打开时聚焦、Tab 循环、关闭时还原
 * - 多弹窗栈：仅最上层响应 Esc / 遮罩点击，滚动锁按栈深度管理
 * - aria-labelledby/describedby 使用 useId 生成，避免嵌套弹窗 id 冲突
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
  variant = "center",
  ariaLabel,
  footer,
  closeGuard,
  initialFocusRef,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const closeOnEscapeRef = useRef(closeOnEscape);
  const closeGuardRef = useRef(closeGuard);
  const initialFocusRefLatest = useRef(initialFocusRef);
  const mounted = useMounted();
  useScrollLock(open);
  const wasOpenRef = useRef(false);
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descriptionId = `${baseId}-description`;

  // 保持最新回调（避免 effect 因内联 onClose 重跑；在 effect 中更新避免渲染期写 ref）
  useEffect(() => {
    onCloseRef.current = onClose;
    closeOnEscapeRef.current = closeOnEscape;
    closeGuardRef.current = closeGuard;
    initialFocusRefLatest.current = initialFocusRef;
  });

  const isTopmost = useCallback(() => modalStack[modalStack.length - 1] === baseId, [baseId]);

  const requestClose = useCallback(() => {
    if (closeGuardRef.current && !closeGuardRef.current()) return;
    onCloseRef.current();
  }, []);

  // 处理 ESC 键关闭 + Tab 焦点循环（仅栈顶弹窗生效）
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!isTopmost()) return;
      if (closeOnEscapeRef.current && event.key === "Escape") {
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusable = getFocusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement as HTMLElement | null;

      if (!activeElement || !dialog.contains(activeElement)) {
        event.preventDefault();
        first.focus();
        return;
      }

      // Tab 循环：在最后一个元素时回到第一个，反之亦然
      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [isTopmost, requestClose]
  );

  // 弹窗栈：用于判断哪个弹窗响应 Esc / 遮罩，并同步背景可访问性
  useEffect(() => {
    if (!open) return;
    modalStack.push(baseId);
    if (dialogRef.current) modalElements.set(baseId, dialogRef.current);
    const frame = requestAnimationFrame(syncModalStack);

    return () => {
      cancelAnimationFrame(frame);
      const index = modalStack.lastIndexOf(baseId);
      if (index >= 0) modalStack.splice(index, 1);
      modalElements.delete(baseId);
      syncModalStack();
    };
  }, [open, baseId]);

  // 记录/还原焦点（嵌套弹窗关闭时回到打开它的元素）
  useEffect(() => {
    if (open) {
      if (!wasOpenRef.current) {
        previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
      }
      wasOpenRef.current = true;
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      if (previouslyFocusedRef.current?.isConnected) {
        previouslyFocusedRef.current.focus();
      }
      previouslyFocusedRef.current = null;
    }
  }, [open]);

  // 键盘监听仅在最上层弹窗挂载期间注册
  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  // 打开后聚焦弹窗内目标元素（优先 initialFocusRef / data-autofocus，否则第一个可聚焦元素）
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const explicit = initialFocusRefLatest.current?.current;
    if (explicit && !explicit.hasAttribute("disabled")) {
      explicit.focus();
      return;
    }

    const autofocusEl = dialog.querySelector<HTMLElement>("[data-autofocus], [autofocus]");
    if (autofocusEl && autofocusEl.getClientRects().length > 0) {
      autofocusEl.focus();
      return;
    }

    getFocusableElements(dialog)[0]?.focus();
  }, [open]);

  const sizeStyles: Record<ModalSize, string> = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
    full: "max-w-6xl",
  };

  const dialogAria = {
    role: "dialog" as const,
    "aria-modal": true as const,
    "aria-labelledby": title ? titleId : undefined,
    "aria-describedby": description ? descriptionId : undefined,
    "aria-label": !title ? (ariaLabel ?? "对话框") : undefined,
  };

  const header = (title || showCloseButton || description) && (
    <div
      className={cn(
        "flex shrink-0 items-start justify-between border-b border-brand-charcoal/10 px-4 py-3 sm:px-6 sm:py-4",
        variant === "drawer" && "pt-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:pt-4"
      )}
    >
      <div>
        {title && (
          <h2 id={titleId} className="text-base font-semibold text-brand-charcoal sm:text-lg">
            {title}
          </h2>
        )}
        {description && (
          <p id={descriptionId} className="mt-1 text-sm text-brand-charcoal/50">
            {description}
          </p>
        )}
      </div>
      {showCloseButton && (
        <button
          type="button"
          onClick={requestClose}
          className="-mr-2 -mt-2 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-brand-charcoal/50 transition-colors hover:bg-brand-charcoal/[0.06] hover:text-brand-charcoal sm:h-9 sm:w-9"
          aria-label="关闭"
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  );

  const footerNode = footer ? (
    <div className="shrink-0 border-t border-brand-charcoal/10 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:px-6">
      {footer}
    </div>
  ) : null;

  const bodyClassName = cn(
    "flex-1 overflow-y-auto overscroll-contain px-4 pt-4 sm:px-6",
    footer ? "pb-4" : "pb-[calc(1rem+env(safe-area-inset-bottom,0px))]"
  );

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className={cn(
            "fixed inset-0 z-[9999]",
            variant === "center" &&
              "flex items-center justify-center px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top,0px))] sm:p-6 md:p-8"
          )}
        >
          {/* Backdrop（仅栈顶弹窗响应点击） */}
          <motion.div
            data-modal-backdrop
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={
              closeOnBackdrop
                ? () => {
                    if (isTopmost()) requestClose();
                  }
                : undefined
            }
            aria-hidden="true"
          />

          {variant === "drawer" ? (
            <motion.div
              ref={dialogRef}
              {...dialogAria}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              className={cn(
                "absolute right-0 top-0 z-10 flex h-dvh w-full flex-col bg-white shadow-2xl",
                sizeStyles[size]
              )}
            >
              {header}
              <div className={bodyClassName}>{children}</div>
              {footerNode}
            </motion.div>
          ) : (
            <motion.div
              ref={dialogRef}
              {...dialogAria}
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 4 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              className={cn(
                "relative z-10 w-full rounded-xl bg-white shadow-2xl",
                "flex max-h-[calc(100dvh-2rem-env(safe-area-inset-top,0px))] flex-col sm:max-h-[calc(100dvh-3rem-env(safe-area-inset-top,0px))] md:max-h-[calc(100dvh-4rem-env(safe-area-inset-top,0px))]",
                sizeStyles[size]
              )}
            >
              {header}
              <div className={bodyClassName}>{children}</div>
              {footerNode}
            </motion.div>
          )}
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
