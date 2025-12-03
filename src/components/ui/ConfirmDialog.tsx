"use client";

import { ReactNode } from "react";
import { AlertTriangle, Info, CheckCircle, XCircle } from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { cn } from "@/lib/utils";

type DialogType = "info" | "warning" | "danger" | "success";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  children?: ReactNode;
  type?: DialogType;
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
  info: "text-blue-500 bg-blue-50",
  warning: "text-yellow-500 bg-yellow-50",
  danger: "text-red-500 bg-red-50",
  success: "text-green-500 bg-green-50",
};

const confirmButtonVariant = {
  info: "primary" as const,
  warning: "primary" as const,
  danger: "danger" as const,
  success: "primary" as const,
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
  confirmText = "确认",
  cancelText = "取消",
  loading = false,
  confirmDisabled = false,
}: ConfirmDialogProps) {
  const Icon = iconMap[type];

  const handleConfirm = async () => {
    await onConfirm();
  };

  return (
    <Modal open={open} onClose={onClose} size="sm" showCloseButton={false}>
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
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          {description && (
            <p className="mt-1 text-sm text-gray-500">{description}</p>
          )}
          {children && <div className="mt-3">{children}</div>}
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outline" onClick={onClose} disabled={loading}>
          {cancelText}
        </Button>
        <Button
          variant={confirmButtonVariant[type]}
          onClick={handleConfirm}
          loading={loading}
          disabled={confirmDisabled}
        >
          {confirmText}
        </Button>
      </div>
    </Modal>
  );
}

