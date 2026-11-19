"use client";

/**
 * 账号注销冷静期全局横幅
 *
 * AuthContext 登录成功后检测到 PENDING 注销申请时，在所有页面顶部展示
 * 「注销处理中，X 天后生效 · 撤回」；撤回成功或无申请时不渲染。
 * 固定定位（fixed top），不挤压页面布局；移动端纵向堆叠、PC 端单行。
 */
import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/Toast";

export function AccountDeletionBanner() {
  const { user, deletionRequest, cancelDeletionRequest, openUserCenter } = useAuth();
  const { success: showSuccess, error: showError } = useToast();
  const [cancelling, setCancelling] = useState(false);

  if (!user || !deletionRequest) return null;

  const handleCancel = async () => {
    if (!window.confirm("确定要撤回账号注销申请吗？撤回后账号恢复正常使用。")) return;
    setCancelling(true);
    try {
      const ok = await cancelDeletionRequest();
      if (ok) {
        showSuccess("注销申请已撤回，账号恢复正常");
      } else {
        showError("撤回失败，请稍后再试");
      }
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-40 border-b border-amber-200 bg-amber-50/95 px-4 py-2.5 backdrop-blur"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-2 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:text-sm">
        <p className="flex items-start gap-1.5">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            账号注销处理中，将于 {deletionRequest.remainingDays} 天后生效，期间可正常使用。
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => openUserCenter("deletion")}
            className="underline underline-offset-2 transition-colors hover:text-amber-950"
          >
            查看详情
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={cancelling}
            className="rounded-full border border-amber-400 px-3 py-1 transition-colors hover:bg-amber-100 disabled:opacity-50"
          >
            {cancelling ? "撤回中..." : "撤回注销申请"}
          </button>
        </div>
      </div>
    </div>
  );
}
