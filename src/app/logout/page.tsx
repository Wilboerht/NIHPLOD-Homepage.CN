/**
 * OIDC RP-Initiated Logout 入口
 * /logout
 *
 * 接收标准参数：
 * - post_logout_redirect_uri: 登出后跳转地址
 * - id_token_hint: 当前用户的 ID Token（可选）
 * - client_id: 发起登出的子项目 Client ID（可选）
 * - state: 防 CSRF 状态参数（可选）
 *
 * 用户确认后调用主站登出 API，然后重定向到 /logout/confirm
 * 做 frontchannel 单点登出，最终回到 post_logout_redirect_uri。
 */
"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function getCsrfTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)__Host-csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function ensureCsrfToken(): Promise<string | null> {
  const existing = getCsrfTokenFromCookie();
  if (existing) return existing;
  try {
    const res = await fetch("/api/auth/csrf", { credentials: "include" });
    if (res.ok) return getCsrfTokenFromCookie();
  } catch {
    // ignore
  }
  return null;
}

function LogoutContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const postLogoutRedirectUri = searchParams.get("post_logout_redirect_uri") || "";
  const clientId = searchParams.get("client_id") || "";
  const state = searchParams.get("state") || "";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    ensureCsrfToken().catch(() => {});
  }, []);

  const handleLogout = async () => {
    setLoading(true);
    setError("");
    try {
      const csrfToken = await ensureCsrfToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (csrfToken) headers["X-CSRF-Token"] = csrfToken;

      const res = await fetch("/api/auth/logout", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ allDevices: true }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || "登出失败");
      }

      // 跳转到 frontchannel logout 确认页
      const confirmUrl = new URL("/logout/confirm", window.location.origin);
      if (postLogoutRedirectUri) {
        confirmUrl.searchParams.set("post_logout_redirect_uri", postLogoutRedirectUri);
      }
      if (state) {
        confirmUrl.searchParams.set("state", state);
      }
      // client_id 仅用于日志/展示，不直接暴露 frontchannel URLs
      if (clientId) {
        confirmUrl.searchParams.set("client_id", clientId);
      }
      window.location.href = confirmUrl.toString();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登出失败");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">退出登录</h1>
        <p className="text-gray-500 mb-6">
          {clientId
            ? `确定要退出登录并同步退出已授权的应用吗？`
            : "确定要退出登录吗？"}
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="flex gap-3 justify-center">
          <button
            onClick={() => router.push(postLogoutRedirectUri || "/")}
            disabled={loading}
            className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleLogout}
            disabled={loading}
            className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? "处理中..." : "确认退出"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LogoutPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      }
    >
      <LogoutContent />
    </Suspense>
  );
}
