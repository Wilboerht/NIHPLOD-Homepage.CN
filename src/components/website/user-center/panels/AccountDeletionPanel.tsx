"use client";

/**
 * 账号注销面板（安全中心「账号注销」分段）
 *
 * 流程（docs/account-deletion-plan.md 第 3、8 节）：
 *   风险与后果说明 → 密码身份验证 → 勾选二次确认 → 提交申请
 *   → 进入冷静期（默认 7 天，X 天后生效），期间展示状态并提供撤回。
 *
 * 口径：
 * - 提交/撤回后同步 AuthContext 的 deletionRequest（驱动全局冷静期横幅）
 * - 微信占位手机号账号（wx_ 前缀）无法网页端自助注销，直接展示客服引导
 * - 未设置密码的账号引导先设密码（服务端同样会拒绝，此处提前提示）
 * - 接口返回的未履约权益提示（warnings）随冷静期视图内联展示，不阻断
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldAlert, TriangleAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { fetchWithAuth, UnauthorizedError } from "@/lib/fetch-with-auth";
import { deferInEffect } from "@/hooks/deferInEffect";
import { WECHAT_PLACEHOLDER_PHONE_PREFIX } from "@/types/auth";
import { PanelShell } from "../PanelShell";

const inputClass =
  "w-full rounded-xl border border-stone-200 bg-white/60 px-4 py-3 text-base text-stone-800 outline-none transition-colors placeholder:text-stone-300 focus:border-stone-400 md:text-sm";

/** 注销后果说明（法务占位文案，结构完整便于替换） */
const DELETION_CONSEQUENCES = {
  removed: {
    title: "以下数据将被删除或不可逆匿名化",
    items: ["手机号（脱敏后释放，可用于新注册）", "昵称、头像、生日、性别等个人资料", "微信/抖音等第三方账号绑定关系"],
  },
  retained: {
    title: "以下数据将依法保留（不含可识别个人信息）",
    items: ["订单、支付、发票等交易记录（法定留存期限）", "登录与操作审计日志", "积分与消费流水（账户标识以匿名 ID 替代）"],
  },
  effects: {
    title: "其他影响",
    items: ["所有已授权子站将退出登录", "未使用的积分、优惠与未履约的兑换权益将作废", "冷静期结束后注销不可撤销"],
  },
};

interface PendingRequest {
  scheduledAt: string;
  remainingDays: number;
}

interface AccountDeletionPanelProps {
  /** 内嵌于安全中心时使用：隐藏内置标题、去掉顶部留白（滚动/内边距由外层接管） */
  embedded?: boolean;
}

function formatScheduledAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("zh-CN");
}

export function AccountDeletionPanel({ embedded }: AccountDeletionPanelProps) {
  const { user, refreshDeletionRequest, cancelDeletionRequest } = useAuth();
  const { success: showSuccess, error: showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingRequest | null>(null);
  /** 未履约权益提示（提交成功后由接口返回，随冷静期视图展示） */
  const [warnings, setWarnings] = useState<string[]>([]);
  /** 微信占位手机号账号：不支持网页端注销（客服引导文案） */
  const [unsupportedMessage, setUnsupportedMessage] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const isPlaceholderAccount = !!user?.phone?.startsWith(WECHAT_PLACEHOLDER_PHONE_PREFIX);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetchWithAuth("/api/user/account/deletion");
      const data = await res.json();
      if (data.success) {
        setPending(data.data?.request ?? null);
      }
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      showError("加载注销状态失败");
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    deferInEffect(fetchStatus);
  }, [fetchStatus]);

  /** 提交注销申请（POST 幂等：已有 PENDING 申请时服务端返回既有申请） */
  const handleSubmit = async () => {
    if (!confirmed) {
      showError("请先勾选确认已了解注销后果");
      return;
    }
    if (!password) {
      showError("请输入登录密码");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetchWithAuth("/api/user/account/deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, reason: reason.trim() || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        setPending(data.data.request);
        setWarnings(Array.isArray(data.data.warnings) ? data.data.warnings : []);
        setPassword("");
        setReason("");
        setConfirmed(false);
        showSuccess("注销申请已提交，冷静期内可随时撤回");
        // 同步全局冷静期横幅
        void refreshDeletionRequest?.();
      } else if (data.error?.code === "PLACEHOLDER_ACCOUNT_UNSUPPORTED") {
        setUnsupportedMessage(data.error.message);
      } else {
        showError(data.error?.message || "提交失败，请稍后再试");
      }
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      showError("网络错误");
    } finally {
      setSubmitting(false);
    }
  };

  /** 撤回注销申请（DELETE；成功后回到申请表单视图） */
  const handleCancel = async () => {
    if (!window.confirm("确定要撤回账号注销申请吗？撤回后账号恢复正常使用。")) return;
    setCancelling(true);
    try {
      const ok = await cancelDeletionRequest();
      if (ok) {
        setPending(null);
        setWarnings([]);
        showSuccess("注销申请已撤回，账号恢复正常");
      } else {
        showError("撤回失败，请稍后再试");
      }
    } finally {
      setCancelling(false);
    }
  };

  return (
    <PanelShell title="账号注销" embedded={embedded} testId="panel-deletion">
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-stone-300" />
        </div>
      ) : isPlaceholderAccount || unsupportedMessage ? (
        /* 微信占位手机号账号 / 服务端判定不支持：客服引导 */
        <div className="max-w-md rounded-xl border border-amber-200/70 bg-amber-50/60 p-4">
          <div className="flex items-start gap-2 text-sm text-amber-800">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {unsupportedMessage ||
                "微信快捷注册的账号暂不支持网页端自助注销，请联系客服 service@nihplod.cn 办理。我们将在核实身份后为您处理。"}
            </p>
          </div>
        </div>
      ) : pending ? (
        /* 冷静期视图：状态 + 撤回 */
        <div className="max-w-md space-y-4">
          <div className="rounded-xl border border-amber-200/70 bg-amber-50/60 p-4">
            <div className="flex items-start gap-2 text-sm text-amber-800">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">
                  注销处理中，将于 {formatScheduledAt(pending.scheduledAt)}（
                  {pending.remainingDays} 天后）生效
                </p>
                <p className="mt-1 text-xs text-amber-700">
                  冷静期内账号可正常使用；生效后账号不可恢复，所有子站将退出登录。
                </p>
              </div>
            </div>
          </div>
          {warnings.length > 0 && (
            <ul className="space-y-1 text-xs text-stone-500">
              {warnings.map((w) => (
                <li key={w}>· {w}</li>
              ))}
            </ul>
          )}
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="rounded-full border border-stone-300 px-6 py-2.5 text-sm text-stone-700 transition-colors hover:bg-white/60 disabled:opacity-50"
          >
            {cancelling ? "撤回中..." : "撤回注销申请"}
          </button>
        </div>
      ) : user && user.hasPassword === false ? (
        /* 未设置密码：无法完成身份验证，引导先设密码 */
        <p className="max-w-md text-sm text-stone-500">
          申请注销前需要先验证登录密码。请先在「个人信息」中设置登录密码，再回到本页操作。
        </p>
      ) : (
        /* 申请表单：风险说明 + 密码验证 + 二次确认 */
        <div className="max-w-md space-y-5">
          <div className="space-y-4">
            {Object.values(DELETION_CONSEQUENCES).map((block) => (
              <div key={block.title}>
                <h3 className="text-sm font-medium text-stone-700">{block.title}</h3>
                <ul className="mt-1 space-y-1 text-xs text-stone-500">
                  {block.items.map((item) => (
                    <li key={item}>· {item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div>
            <label htmlFor="deletion-password" className="mb-1 block text-xs text-stone-400">
              登录密码（身份验证）
            </label>
            <input
              id="deletion-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              autoComplete="current-password"
            />
          </div>

          <div>
            <label htmlFor="deletion-reason" className="mb-1 block text-xs text-stone-400">
              注销原因（选填）
            </label>
            <input
              id="deletion-reason"
              type="text"
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="帮助我们改进（选填）"
              className={inputClass}
            />
          </div>

          <label className="flex items-start gap-2 text-xs text-stone-600">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand-primary"
            />
            <span>
              我已阅读并理解上述后果，知晓冷静期结束后账号将被注销且不可恢复，自愿申请注销账号。
            </span>
          </label>

          <button
            onClick={handleSubmit}
            disabled={submitting || !confirmed || !password}
            className="rounded-full bg-red-700 px-6 py-2.5 text-sm text-white transition-colors hover:bg-red-800 disabled:opacity-50"
          >
            {submitting ? "提交中..." : "申请注销账号"}
          </button>
        </div>
      )}
    </PanelShell>
  );
}
