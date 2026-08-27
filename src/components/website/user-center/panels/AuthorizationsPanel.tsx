"use client";

/**
 * 授权管理面板（共享）
 * OAuth 已授权应用列表 + 撤销授权
 *
 * 抽取自原 /account 页面的授权管理 Tab，弹窗与 /account/embed 共用：
 * - embed 场景通过 onRevoked 回调向父窗口发送 NIHPLOD_SSO_REVOKE；
 * - embed 自带 tab 标题，通过 hideTitle 隐藏面板内置标题。
 *
 * 取数统一走 fetchWithAuth：写操作自动附带 CSRF Token，401 自动刷新重试；
 * 刷新最终失败（UnauthorizedError）时静默交给外层（AuthContext / embed 登录提示）处理。
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, KeyRound } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { fetchWithAuth, UnauthorizedError } from "@/lib/fetch-with-auth";
import { deferInEffect } from "@/hooks/deferInEffect";

interface OAuthSession {
  clientId: string;
  clientName: string;
  scopes: string[];
  createdAt: string;
}

interface AuthorizationsPanelProps {
  /** 撤销成功回调（embed 场景用于 postMessage 通知父窗口） */
  onRevoked?: (clientId: string) => void;
  /** 隐藏内置标题（embed 自带 tab 标题时使用） */
  hideTitle?: boolean;
}

export function AuthorizationsPanel({ onRevoked, hideTitle }: AuthorizationsPanelProps) {
  const [sessions, setSessions] = useState<OAuthSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const { error: showError } = useToast();

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetchWithAuth("/api/user/oauth/sessions");
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setSessions(data.data);
      }
    } catch {
      // 授权列表加载失败不阻断主流程（与原 /account、embed 行为一致，静默失败）
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    deferInEffect(fetchSessions);
  }, [fetchSessions]);

  const handleRevoke = async (clientId: string, clientName: string) => {
    if (
      !window.confirm(
        `确定要撤销对「${clientName || clientId}」的授权吗？撤销后该应用将无法再访问您的账户信息。`
      )
    ) {
      return;
    }
    setRevoking(clientId);
    try {
      const res = await fetchWithAuth("/api/user/oauth/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json();
      if (data.success) {
        setSessions((prev) => prev.filter((s) => s.clientId !== clientId));
        onRevoked?.(clientId);
      } else {
        showError(data.error?.message || "撤销失败");
      }
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      showError("撤销失败");
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="flex h-full flex-col pt-4 md:pt-10" data-testid="panel-authorizations">
      {/* 标题 - 移动端由弹窗全局 Header 管理；embed 自带 tab 标题时隐藏 */}
      {!hideTitle && (
        <div className="hidden flex-shrink-0 border-b border-stone-200/60 px-6 pb-6 md:flex md:px-16">
          <h2 className="text-xl font-medium tracking-wide text-stone-800">授权管理</h2>
        </div>
      )}

      <div className="scrollbar-hide flex-1 overflow-y-auto px-6 py-6 md:px-16">
        <p className="mb-4 text-sm text-stone-400">
          管理已授权的第三方应用。撤销授权后，该应用将无法访问您的账户信息。
        </p>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-stone-300" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="py-10 text-center text-sm text-stone-400">暂无已授权应用</p>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <div
                key={s.clientId}
                className="flex items-center justify-between gap-3 rounded-xl border border-stone-200/60 bg-white/40 p-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <KeyRound className="h-5 w-5 shrink-0 text-stone-400" strokeWidth={1.5} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-stone-800">
                      {s.clientName || s.clientId}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-stone-400">
                      权限：{s.scopes.join(", ")} · 授权时间：
                      {new Date(s.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleRevoke(s.clientId, s.clientName)}
                  disabled={revoking === s.clientId}
                  className="shrink-0 rounded-full border border-red-200 px-4 py-1.5 text-xs text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50"
                >
                  {revoking === s.clientId ? "撤销中..." : "撤销授权"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
