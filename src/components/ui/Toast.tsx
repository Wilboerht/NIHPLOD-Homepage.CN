"use client";

interface ToastProps {
  message: string;
  type?: "success" | "error" | "warning" | "info";
  onClose?: () => void;
}

/**
 * 通用 Toast 提示组件
 * TODO: 实现完整功能
 */
export function Toast({ message, type = "info", onClose }: ToastProps) {
  const typeStyles = {
    success: "bg-green-500 text-white",
    error: "bg-red-500 text-white",
    warning: "bg-yellow-500 text-white",
    info: "bg-brand-charcoal text-white",
  };

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 shadow-lg ${typeStyles[type]}`}
    >
      <span>{message}</span>
      {onClose && (
        <button onClick={onClose} className="opacity-70 hover:opacity-100">
          ✕
        </button>
      )}
    </div>
  );
}
