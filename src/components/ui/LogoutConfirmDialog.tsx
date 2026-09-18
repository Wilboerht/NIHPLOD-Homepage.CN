"use client";

/**
 * 退出登录确认框（分层退出：默认仅退出当前设备，勾选后全局退出所有平台）
 *
 * 卡片样式与子站（Skin-Advisor AccountModal）的退出确认框保持一致：
 * 圆角卡片 + 极简勾选行 + 取消/红色确认双按钮。
 * 勾选状态由组件内部管理，onConfirm 回传 allDevices。
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, m } from "framer-motion";

interface LogoutConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (allDevices: boolean) => void | Promise<void>;
  loading?: boolean;
}

export function LogoutConfirmDialog({
  open,
  onClose,
  onConfirm,
  loading = false,
}: LogoutConfirmDialogProps) {
  const [allDevices, setAllDevices] = useState(false);

  // 每次打开重置为默认（仅退出当前设备）
  useEffect(() => {
    if (open) setAllDevices(false);
  }, [open]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="logout-confirm-title"
          // 需高于用户中心弹窗（z-[9999]）
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
        >
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-md"
          />
          <m.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative z-10 w-full max-w-xs rounded-[24px] bg-[#FDFBF7] px-6 pb-6 pt-6 shadow-[0_45px_80px_-16px_rgba(0,0,0,0.15)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="logout-confirm-title"
              className="mb-2 text-base font-semibold text-brand-charcoal"
            >
              退出登录
            </h3>
            <p className="mb-4 text-[13px] font-light leading-relaxed text-brand-charcoal/60">
              默认仅退出当前设备；勾选后将同时退出所有设备和已授权的平台。
            </p>
            <label className="mb-6 flex cursor-pointer select-none items-center gap-2 text-[13px] tracking-[0.03em] text-brand-charcoal/70">
              <input
                type="checkbox"
                checked={allDevices}
                onChange={(e) => setAllDevices(e.target.checked)}
                className="h-4 w-4 accent-brand-primary"
              />
              同时退出所有设备和已授权的平台
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="flex-1 cursor-pointer rounded-xl border border-brand-charcoal/10 bg-brand-charcoal/5 px-4 py-2.5 text-[13px] tracking-[0.05em] text-brand-charcoal/70 transition-colors hover:bg-brand-charcoal/10 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => onConfirm(allDevices)}
                disabled={loading}
                className="flex-1 cursor-pointer rounded-xl bg-red-600 px-4 py-2.5 text-[13px] tracking-[0.05em] text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {allDevices ? "退出所有平台" : "退出登录"}
              </button>
            </div>
          </m.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
