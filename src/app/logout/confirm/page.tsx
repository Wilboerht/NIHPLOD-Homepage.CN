/**
 * Frontchannel Logout 确认页面
 * /logout/confirm
 *
 * 用户在主站登出后，展示登出成功并自动跳转回 post_logout_redirect_uri。
 *
 * Query 参数:
 * - post_logout_redirect_uri: 登出后跳转地址（可选，已由 /logout 校验为已注册 origin）
 * - state: OIDC state 参数（可选，透传回 redirect）
 *
 * 安全说明：
 * - 不再从 URL 读取并渲染任意 iframe 源。frontchannel logout URL 必须来自
 *   服务端已注册的 backchannel/frontchannel logout URI，禁止通过 query 参数透传，
 *   否则存在反射型 XSS 与开放重定向风险。当前子站 Cookie 清理由 SDK 本地 logout
 *   及服务端 backchannel logout 保证。
 */
"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense, useCallback } from "react";
import { useRouter } from "next/navigation";

function LogoutConfirmContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawRedirectUri = searchParams.get("post_logout_redirect_uri");
  const state = searchParams.get("state");
  const [redirectUri, setRedirectUri] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const getFinalRedirectUrl = useCallback(() => {
    if (redirectUri) {
      const finalUrl = new URL(redirectUri, window.location.origin);
      if (state) finalUrl.searchParams.set("state", state);
      return finalUrl.toString();
    }
    return null;
  }, [redirectUri, state]);

  useEffect(() => {
    if (!rawRedirectUri) {
      setRedirectUri(null);
      return;
    }

    if (rawRedirectUri.startsWith("/") && !rawRedirectUri.startsWith("//")) {
      setRedirectUri(rawRedirectUri);
      return;
    }

    fetch(`/api/oauth/check-post-logout-uri?post_logout_redirect_uri=${encodeURIComponent(rawRedirectUri)}`)
      .then((res) => res.json())
      .then((data) => {
        setRedirectUri(data.trusted ? rawRedirectUri : null);
      })
      .catch(() => setRedirectUri(null));
  }, [rawRedirectUri]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDone(true);
      const finalUrl = getFinalRedirectUrl();
      if (finalUrl) {
        window.location.href = finalUrl;
      } else {
        router.push("/");
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [redirectUri, router, getFinalRedirectUrl]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">已退出登录</h1>
        <p className="text-gray-500 mb-6">您已成功退出登录</p>

        <p className="text-sm text-gray-400">
          {done ? "正在跳转..." : "请稍候..."}
        </p>

        <button
          onClick={() => {
            const finalUrl = getFinalRedirectUrl();
            if (finalUrl) {
              window.location.href = finalUrl;
            } else {
              router.push("/");
            }
          }}
          className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
        >
          立即跳转
        </button>
      </div>
    </div>
  );
}

export default function LogoutConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      }
    >
      <LogoutConfirmContent />
    </Suspense>
  );
}
