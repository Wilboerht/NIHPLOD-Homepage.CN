"use client";

/**
 * 账号绑定面板（共享）
 * 展示已绑定的第三方身份并支持自助解绑。
 *
 * 安全约束（服务端强制）：仅能解绑本人身份；占位手机号账号（未绑定真实手机号）
 * 拒绝解绑，避免账号失去唯一登录方式。
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, Link2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { fetchWithAuth, UnauthorizedError } from "@/lib/fetch-with-auth";
import { deferInEffect } from "@/hooks/deferInEffect";

interface Identity {
  id: string;
  provider: string;
  nickname: string | null;
  avatar: string | null;
  createdAt: string;
  lastSyncAt: string;
  canUnbind: boolean;
}

const PROVIDER_LABELS: Record<string, string> = {
  wechat_open: "微信（开放平台）",
  wechat_mp: "微信（服务号）",
  wechat_miniprogram: "微信小程序",
  douyin: "抖音",
};

function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] || provider;
}

interface BindingsPanelProps {
  /** 内嵌于安全中心时使用：隐藏内置标题、去掉顶部留白（滚动/内边距由外层接管） */
  embedded?: boolean;
}

export function BindingsPanel({ embedded }: BindingsPanelProps) {
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [loading, setLoading] = useState(true);
  const [unbindingId, setUnbindingId] = useState<string | null>(null);
  const { success: showSuccess, error: showError } = useToast();

  const fetchIdentities = useCallback(async () => {
    try {
      const res = await fetchWithAuth("/api/user/identities");
      const data = await res.json();
      if (data.success) {
        setIdentities(data.data);
      }
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      showError("加载绑定信息失败");
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    deferInEffect(fetchIdentities);
  }, [fetchIdentities]);

  const handleUnbind = async (identity: Identity) => {
    if (
      !window.confirm(
        `确定要解除「${providerLabel(identity.provider)}」的绑定吗？解除后将无法再使用该平台一键登录。`
      )
    ) {
      return;
    }
    setUnbindingId(identity.id);
    try {
      const res = await fetchWithAuth(`/api/user/identities/${identity.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setIdentities((prev) => prev.filter((i) => i.id !== identity.id));
        showSuccess("已解除绑定");
      } else {
        showError(data.error?.message || "解除绑定失败");
      }
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      showError("网络错误");
    } finally {
      setUnbindingId(null);
    }
  };

  return (
    <div
      className={`flex h-full flex-col ${embedded ? "" : "pt-4 md:pt-10"}`}
      data-testid="panel-bindings"
    >
      {!embedded && (
        <div className="hidden flex-shrink-0 border-b border-stone-200/60 px-6 pb-6 md:flex md:px-16">
          <h2 className="text-xl font-medium tracking-wide text-stone-800">账号绑定</h2>
        </div>
      )}

      <div className="scrollbar-hide flex-1 overflow-y-auto overscroll-contain px-6 py-6 md:px-16">
        <p className="mb-4 text-sm text-stone-400">
          管理第三方平台绑定，可解除不再使用的平台授权。
        </p>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-stone-300" />
          </div>
        ) : identities.length === 0 ? (
          <p className="py-10 text-center text-sm text-stone-400">暂无第三方绑定</p>
        ) : (
          <div className="space-y-3">
            {identities.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-stone-200/60 bg-white/40 p-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Link2 className="h-5 w-5 shrink-0 text-stone-400" strokeWidth={1.5} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-stone-800">
                      {providerLabel(item.provider)}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-stone-400">
                      {item.nickname ? `${item.nickname} · ` : ""}
                      绑定时间：{new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                {item.canUnbind ? (
                  <button
                    onClick={() => handleUnbind(item)}
                    disabled={unbindingId === item.id}
                    className="shrink-0 rounded-full border border-red-200 px-4 py-1.5 text-xs text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50"
                  >
                    {unbindingId === item.id ? "解绑中..." : "解除绑定"}
                  </button>
                ) : (
                  <span
                    className="shrink-0 text-xs text-stone-300"
                    title="请先绑定真实手机号，避免账号无法登录"
                  >
                    需先绑定手机号
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
