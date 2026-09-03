"use client";

/**
 * 登录历史面板（共享）
 * 最近 50 条登录记录
 *
 * 抽取自原 /account 页面的登录历史 Tab，弹窗等外壳共用。
 * 取数统一走 fetchWithAuth（401 自动刷新重试）；
 * 刷新最终失败（UnauthorizedError）时静默交给 AuthContext 的登录态管理处理。
 * 表格在弹窗窄栏/移动端通过 overflow-x-auto 横向滚动保证可读性。
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { fetchWithAuth, UnauthorizedError } from "@/lib/fetch-with-auth";
import { deferInEffect } from "@/hooks/deferInEffect";

interface LoginRecord {
  id: string;
  type: string;
  success: boolean;
  reason: string | null;
  ipAddress: string;
  createdAt: string;
}

interface LoginHistoryPanelProps {
  /** 内嵌于安全中心时使用：隐藏内置标题、去掉顶部留白（滚动/内边距由外层接管） */
  embedded?: boolean;
}

export function LoginHistoryPanel({ embedded }: LoginHistoryPanelProps) {
  const [loginHistory, setLoginHistory] = useState<LoginRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const { error: showError } = useToast();

  const fetchLoginHistory = useCallback(async () => {
    try {
      const res = await fetchWithAuth("/api/user/login-history");
      const data = await res.json();
      if (data.success) {
        setLoginHistory(data.data);
      }
    } catch (e) {
      if (e instanceof UnauthorizedError) return;
      showError("加载登录历史失败");
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    deferInEffect(fetchLoginHistory);
  }, [fetchLoginHistory]);

  return (
    <div
      className={`flex h-full flex-col ${embedded ? "" : "pt-4 md:pt-10"}`}
      data-testid="panel-login-history"
    >
      {/* 标题 - 移动端由弹窗全局 Header 管理；内嵌时由安全中心分段标签承担 */}
      {!embedded && (
        <div className="hidden flex-shrink-0 border-b border-stone-200/60 px-6 pb-6 md:flex md:px-16">
          <h2 className="text-xl font-medium tracking-wide text-stone-800">登录历史</h2>
        </div>
      )}

      <div className="scrollbar-hide flex-1 overflow-y-auto px-6 py-6 md:px-16">
        <p className="mb-4 text-sm text-stone-400">最近 50 条登录记录。</p>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-stone-300" />
          </div>
        ) : loginHistory.length === 0 ? (
          <p className="py-10 text-center text-sm text-stone-400">暂无登录记录</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-stone-200/60 text-left">
                  <th className="py-2 pr-4 text-xs font-medium text-stone-400">时间</th>
                  <th className="py-2 pr-4 text-xs font-medium text-stone-400">方式</th>
                  <th className="py-2 pr-4 text-xs font-medium text-stone-400">IP</th>
                  <th className="py-2 text-xs font-medium text-stone-400">结果</th>
                </tr>
              </thead>
              <tbody>
                {loginHistory.map((r, i) => (
                  <tr key={r.id ?? i} className="border-b border-stone-100 last:border-0">
                    <td className="py-2 pr-4 text-stone-600">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 text-stone-600">
                      {r.type === "sms" ? "验证码" : r.type === "oauth" ? "OAuth授权" : "密码"}
                    </td>
                    <td className="py-2 pr-4 text-stone-400">{r.ipAddress}</td>
                    <td className="py-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${
                          r.success
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-red-50 text-red-500"
                        }`}
                      >
                        {r.success ? "成功" : "失败"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
