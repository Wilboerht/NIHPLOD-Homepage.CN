"use client";

import { useRef, useState } from "react";
import { Modal } from "./Modal";

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
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [allDevices, setAllDevices] = useState(false);
  const close = () => {
    setAllDevices(false);
    onClose();
  };
  const confirm = () => {
    const value = allDevices;
    setAllDevices(false);
    void onConfirm(value);
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="sm"
      role="alertdialog"
      title="退出登录"
      description="默认仅退出当前设备；勾选后将同时退出所有设备和已授权的平台。"
      showCloseButton={false}
      closeOnBackdrop={!loading}
      closeOnEscape={!loading}
      initialFocusRef={cancelRef}
      footer={
        <div className="flex gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={close}
            disabled={loading}
            className="min-h-11 flex-1 cursor-pointer rounded-xl border border-brand-charcoal/15 bg-brand-charcoal/5 px-4 text-[13px] tracking-[0.05em] text-brand-charcoal/80 transition-colors hover:bg-brand-charcoal/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={loading}
            className="min-h-11 flex-1 cursor-pointer rounded-xl bg-red-600 px-4 text-[13px] tracking-[0.05em] text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-50"
          >
            {allDevices ? "退出所有平台" : "退出登录"}
          </button>
        </div>
      }
    >
      <label className="flex min-h-11 cursor-pointer select-none items-center gap-3 rounded-xl border border-brand-charcoal/10 px-3 text-[13px] tracking-[0.03em] text-brand-charcoal/80">
        <input
          type="checkbox"
          checked={allDevices}
          onChange={(event) => setAllDevices(event.target.checked)}
          className="h-4 w-4 accent-brand-primary"
        />
        同时退出所有设备和已授权的平台
      </label>
    </Modal>
  );
}
