/**
 * Frontchannel Logout 确认页面
 * /logout/confirm
 *
 * 用户在主站登出后，渲染指向所有子站 logout iframe 的页面，
 * 确保各子站的浏览器 Cookie 也被清理。
 *
 * Query 参数:
 * - post_logout_redirect_uri: 登出后跳转地址（可选）
 * - clients: 逗号分隔的子站 logout URL 列表
 */
"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";

function LogoutConfirmContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const redirectUri = searchParams.get("post_logout_redirect_uri");
  const clientsParam = searchParams.get("clients") || "";
  const clientUrls = clientsParam
    ? clientsParam.split(",").map((url) => decodeURIComponent(url.trim())).filter(Boolean)
    : [];

  const [loadedCount, setLoadedCount] = useState(0);
  const [done, setDone] = useState(false);

  // 所有 iframe 加载完成后自动跳转
  useEffect(() => {
    if (clientUrls.length === 0) {
      // 没有子站需要登出，直接跳转
      const timer = setTimeout(() => {
        if (redirectUri) {
          window.location.href = redirectUri;
        } else {
          router.push("/");
        }
      }, 1500);
      return () => clearTimeout(timer);
    }

    if (loadedCount >= clientUrls.length && !done) {
      setDone(true);
      const timer = setTimeout(() => {
        if (redirectUri) {
          window.location.href = redirectUri;
        } else {
          router.push("/");
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [loadedCount, clientUrls.length, redirectUri, router, done]);

  const handleIframeLoad = () => {
    setLoadedCount((c) => c + 1);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">已退出登录</h1>
        <p className="text-gray-500 mb-6">
          {clientUrls.length > 0
            ? `正在同步登出 ${clientUrls.length} 个已授权的应用...`
            : "您已成功退出登录"}
        </p>

        {/* 子站 SLO iframe（隐藏） */}
        {clientUrls.map((url, i) => (
          <iframe
            key={i}
            src={url}
            onLoad={handleIframeLoad}
            onError={handleIframeLoad}
            style={{ display: "none" }}
            title={`slo-iframe-${i}`}
          />
        ))}

        {/* 进度指示 */}
        {clientUrls.length > 0 && (
          <div className="mb-4">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                style={{
                  width: `${clientUrls.length > 0 ? (loadedCount / clientUrls.length) * 100 : 100}%`,
                }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {loadedCount}/{clientUrls.length} 完成
            </p>
          </div>
        )}

        <p className="text-sm text-gray-400">
          {done ? "即将跳转..." : "请稍候..."}
        </p>

        <button
          onClick={() => {
            if (redirectUri) {
              window.location.href = redirectUri;
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
