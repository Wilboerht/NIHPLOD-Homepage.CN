"use client";

import { ReactNode, useRef } from "react";
import { AlertTriangle, Info, CheckCircle, XCircle } from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";

type DialogType = "info" | "warning" | "danger" | "success";
type ConfirmVariant = "primary" | "danger";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  children?: ReactNode;
  type?: DialogType;
  /** 覆盖确认按钮样式：warning 类型也可用于不可逆的状态移除 */
  confirmVariant?: ConfirmVariant;
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
  confirmDisabled?: boolean;
}

const iconMap = {
  info: Info,
  warning: AlertTriangle,
  danger: XCircle,
  success: CheckCircle,
};

const iconColorMap = {
  info: "text-brand-primary bg-brand-primary/10",
  warning: "text-status-warning-fg bg-status-warning-soft",
  danger: "text-status-danger-fg bg-status-danger-soft",
  success: "text-status-success-fg bg-status-success-soft",
};

const defaultConfirmVariant: Record<DialogType, ConfirmVariant> = {
  info: "primary",
  warning: "primary",
  danger: "danger",
  success: "primary",
};

/**
 * 确认对话框组件
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  children,
  type = "warning",
  confirmVariant,
  confirmText = "确认",
  cancelText = "取消",
  loading = false,
  confirmDisabled = false,
}: ConfirmDialogProps) {
  const Icon = iconMap[type];
  const { error: showError } = useToast();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const handleConfirm = async () => {
    try {
      await onConfirm();
    } catch (err) {
      const message = err instanceof Error ? err.message : "操作失败，请重试";
      showError(message);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      showCloseButton={false}
      ariaLabel={title}
      role={type === "danger" || type === "warning" ? "alertdialog" : "dialog"}
      // 请求进行中禁止遮罩/Esc 关闭，避免操作结果丢失上下文
      closeOnBackdrop={!loading}
      closeOnEscape={!loading}
      // 危险操作默认聚焦“取消”，避免直接按 Enter 执行不可逆操作
      initialFocusRef={
        confirmDisabled ? undefined : type === "danger" || type === "warning" ? cancelRef : confirmRef
      }
      footer={
        <div className="flex flex-wrap justify-end gap-3">
          <Button ref={cancelRef} variant="outline" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button
            ref={confirmRef}
            variant={confirmVariant ?? defaultConfirmVariant[type]}
            onClick={handleConfirm}
            loading={loading}
            disabled={confirmDisabled}
          >
            {confirmText}
          </Button>
        </div>
      }
    >
      <div className="flex gap-4">
        <div
          className={cn(
            "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full",
            iconColorMap[type]
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-brand-charcoal">{title}</h3>
          {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
          {children && <div className="mt-3">{children}</div>}
        </div>
      </div>
    </Modal>
  );
}
