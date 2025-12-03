"use client";

import { ReactNode, useEffect, useCallback } from "react";
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
  // 处理 ESC 键关闭
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (closeOnEscape && event.key === "Escape") {
        onClose();
      }
    },
    [closeOnEscape, onClose]
  );

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      document.addEventListener("keydown", handleKeyDown);
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  const sizeStyles = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    full: "max-w-4xl",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Modal Content */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modal-title" : undefined}
        aria-describedby={description ? "modal-description" : undefined}
        className={cn(
          "relative z-10 w-full rounded-xl bg-white shadow-2xl",
          "animate-in fade-in-0 zoom-in-95 duration-200",
          sizeStyles[size]
        )}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
            <div>
              {title && (
                <h2
                  id="modal-title"
                  className="text-lg font-semibold text-gray-900"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p id="modal-description" className="mt-1 text-sm text-gray-500">
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <button
                onClick={onClose}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="关闭"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
}

// 兼容旧版本 API
export { Modal as default };
