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
import { deferInEffect } from "@/hooks/deferInEffect";

function LogoutConfirmContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawRedirectUri = searchParams.get("post_logout_redirect_uri");
  const state = searchParams.get("state");
  const clientId = searchParams.get("client_id");
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
    deferInEffect(() => {
      if (!rawRedirectUri) {
        setRedirectUri(null);
        return;
      }

      if (rawRedirectUri.startsWith("/") && !rawRedirectUri.startsWith("//")) {
        setRedirectUri(rawRedirectUri);
        return;
      }

      // 绝对 URL 的可信校验必须携带 client_id：服务端要求回跳地址与该 client
      // 注册的 postLogoutRedirectUris 精确匹配，缺 client_id 一律判为不可信
      const checkUrl = new URL("/api/oauth/check-post-logout-uri", window.location.origin);
      if (clientId) checkUrl.searchParams.set("client_id", clientId);
      checkUrl.searchParams.set("post_logout_redirect_uri", rawRedirectUri);
      fetch(checkUrl.toString())
        .then((res) => res.json())
        .then((data) => {
          setRedirectUri(data.trusted ? rawRedirectUri : null);
        })
        .catch(() => setRedirectUri(null));
    });
  }, [rawRedirectUri, clientId]);

  useEffect(() => {
    // 等打勾动画播完（约 0.7s）再自动跳回发起方，兼顾反馈感与停留感；
    // 页面与底部文字链接保留为自动跳转失败时的兜底
    const timer = setTimeout(() => {
      setDone(true);
      const finalUrl = getFinalRedirectUrl();
      if (finalUrl) {
        window.location.href = finalUrl;
      } else {
        router.push("/");
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [redirectUri, router, getFinalRedirectUrl]);

  const handleManualRedirect = () => {
    const finalUrl = getFinalRedirectUrl();
    if (finalUrl) {
      window.location.href = finalUrl;
    } else {
      router.push("/");
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white">
      {/* 打勾动画：圆圈描边 → 对勾描边依次绘制，CSS keyframes 一次性播放 */}
      <style>{`
        @keyframes logout-draw { to { stroke-dashoffset: 0; } }
        @keyframes logout-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        .logout-check-circle { stroke-dasharray: 166; stroke-dashoffset: 166; animation: logout-draw 0.5s ease-out forwards; }
        .logout-check-mark { stroke-dasharray: 48; stroke-dashoffset: 48; animation: logout-draw 0.3s ease-out 0.4s forwards; }
        .logout-fade-in { opacity: 0; animation: logout-fade 0.3s ease-out 0.7s forwards; }
        @media (prefers-reduced-motion: reduce) {
          .logout-check-circle, .logout-check-mark { animation: none; stroke-dashoffset: 0; }
          .logout-fade-in { animation: none; opacity: 1; }
        }
      `}</style>

      <svg
        className="h-14 w-14"
        viewBox="0 0 56 56"
        fill="none"
        aria-hidden="true"
      >
        <circle
          className="logout-check-circle"
          cx="28"
          cy="28"
          r="26"
          stroke="#10b981"
          strokeWidth="2.5"
        />
        <path
          className="logout-check-mark"
          d="M17 29l8 8 15-16"
          stroke="#10b981"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <h1 className="logout-fade-in mt-5 text-lg font-medium text-gray-900">
        已退出登录
      </h1>
      <p className="logout-fade-in mt-1 text-sm text-gray-400">
        {done ? "正在返回..." : "即将返回..."}
      </p>

      {/* 兜底：自动跳转失败时用户可手动返回；平时仅作不起眼的文字链接 */}
      <button
        onClick={handleManualRedirect}
        className="logout-fade-in mt-6 text-sm text-gray-400 underline decoration-gray-300 underline-offset-4 transition-colors hover:text-gray-600"
      >
        没有自动跳转？点击返回
      </button>
    </div>
  );
}

export default function LogoutConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
        </div>
      }
    >
      <LogoutConfirmContent />
    </Suspense>
  );
}
