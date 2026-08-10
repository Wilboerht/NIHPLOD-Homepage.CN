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
import { useSearchParams } from "next/navigation";

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

async function checkTrustedLogoutUri(uri: string, clientId: string | null): Promise<boolean> {
  if (!uri) return true;
  if (uri.startsWith("/") && !uri.startsWith("//")) return true;
  try {
    const url = new URL("/api/oauth/check-post-logout-uri", window.location.origin);
    if (clientId) url.searchParams.set("client_id", clientId);
    url.searchParams.set("post_logout_redirect_uri", uri);
    const res = await fetch(url.toString());
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.trusted;
  } catch {
    return false;
  }
}

function LogoutContent() {
  const searchParams = useSearchParams();

  const postLogoutRedirectUri = searchParams.get("post_logout_redirect_uri") || "";
  const clientId = searchParams.get("client_id") || "";
  const state = searchParams.get("state") || "";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [trustedUri, setTrustedUri] = useState<string | null>(null);
  const [trustCheckDone, setTrustCheckDone] = useState(false);

  useEffect(() => {
    ensureCsrfToken().catch(() => {});
  }, []);

  useEffect(() => {
    checkTrustedLogoutUri(postLogoutRedirectUri, clientId || null).then((trusted) => {
      setTrustedUri(trusted ? postLogoutRedirectUri : null);
      setTrustCheckDone(true);
    });
  }, [postLogoutRedirectUri, clientId]);

  const handleLogout = async () => {
    setLoading(true);
    setError("");
    try {
      const csrfToken = await ensureCsrfToken();
      if (!csrfToken) {
        setError("安全令牌获取失败，请刷新页面后重试");
        setLoading(false);
        return;
      }
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      headers["X-CSRF-Token"] = csrfToken;

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

      // 清除所有客户端存储数据（auth_hint、购物车、偏好等）
      try {
        localStorage.clear();
      } catch {}

      // 跳转到 frontchannel logout 确认页（仅传递可信的重定向地址）
      const confirmUrl = new URL("/logout/confirm", window.location.origin);
      if (trustedUri) {
        confirmUrl.searchParams.set("post_logout_redirect_uri", trustedUri);
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
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">退出登录</h1>
        <p className="mb-6 text-gray-500">
          {clientId ? `确定要退出登录并同步退出已授权的应用吗？` : "确定要退出登录吗？"}
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="flex justify-center gap-3">
          <button
            onClick={() => {
              window.location.href = "/";
            }}
            disabled={loading}
            className="rounded-lg border border-gray-300 px-6 py-3 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleLogout}
            disabled={loading || !trustCheckDone}
            className="rounded-lg bg-red-600 px-6 py-3 text-white hover:bg-red-700 disabled:opacity-50"
          >
            {!trustCheckDone ? "验证中..." : loading ? "处理中..." : "确认退出"}
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
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
        </div>
      }
    >
      <LogoutContent />
    </Suspense>
  );
}
