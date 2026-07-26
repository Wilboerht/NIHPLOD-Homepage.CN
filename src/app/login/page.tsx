/**
 * NIHPLOD 统一登录页
 * /login
 *
 * 支持两种模式：
 * 1. 直接登录（mode=login）：OAuth 授权流程中的登录
 * 2. Consent 授权确认（mode=consent）：已登录用户确认授权
 *
 * 不影响官网前台模态框登录（AuthModal）。
 */
"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("return_to");
  const mode = searchParams.get("mode");
  const clientName = searchParams.get("client_name") || "第三方应用";
  const oauthParams = searchParams.get("oauth_params") || "";

  const [tab, setTab] = useState<"sms" | "password" | "wechat">("sms");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // 微信扫码状态
  const [wechatQrData, setWechatQrData] = useState<string | null>(null);
  const [wechatLoading, setWechatLoading] = useState(false);

  // 倒计时
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Consent 模式
  if (mode === "consent") {
    const handleConsent = async (action: "approve" | "deny") => {
      setLoading(true);
      try {
        const params = new URLSearchParams(oauthParams);
        const res = await fetch("/api/oauth/authorize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            client_id: params.get("client_id"),
            redirect_uri: params.get("redirect_uri"),
            scope: params.get("scope"),
            state: params.get("state"),
            code_challenge: params.get("code_challenge"),
            code_challenge_method: params.get("code_challenge_method"),
          }),
          redirect: "manual",
        });

        if (res.status >= 300 && res.status < 400) {
          const location = res.headers.get("Location");
          if (location) {
            window.location.href = location;
            return;
          }
        }

        const data = await res.json();
        setError(data.error_description || "操作失败");
      } catch {
        setError("网络错误");
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">NIHPLOD</h1>
            <p className="text-gray-500 mt-2">授权登录</p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800">
              <strong>{clientName}</strong> 请求访问您的账户信息
            </p>
            <p className="text-xs text-blue-600 mt-1">
              授权后，{clientName} 将可以获取您的昵称、头像等基本信息。
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => handleConsent("deny")}
              disabled={loading}
              className="flex-1 py-3 px-4 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              拒绝
            </button>
            <button
              onClick={() => handleConsent("approve")}
              disabled={loading}
              className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "处理中..." : "授权登录"}
            </button>
          </div>

          <button
            onClick={() => router.push("/")}
            className="w-full mt-4 py-2 text-sm text-gray-500 hover:text-gray-700"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  // 登录模式
  const handleSendCode = async () => {
    if (!/^1\d{10}$/.test(phone)) {
      setError("请输入正确的手机号");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, type: "login" }),
      });
      const data = await res.json();
      if (data.success) {
        setCodeSent(true);
        setCountdown(60);
      } else {
        setError(data.error?.message || "发送失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  };

  const handleSmsLogin = async () => {
    if (!code) {
      setError("请输入验证码");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code, type: "sms" }),
      });
      const data = await res.json();
      if (data.success) {
        // 登录成功，重定向到 return_to
        if (returnTo) {
          router.push(decodeURIComponent(returnTo));
        } else {
          router.push("/");
        }
      } else {
        setError(data.error?.message || "登录失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async () => {
    if (!password) {
      setError("请输入密码");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      const data = await res.json();
      if (data.success) {
        if (returnTo) {
          router.push(decodeURIComponent(returnTo));
        } else {
          router.push("/");
        }
      } else {
        setError(data.error?.message || "登录失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  };

  // 微信扫码登录：获取授权 URL 并生成二维码
  const handleWechatTab = async () => {
    setTab("wechat");
    if (wechatQrData) return; // 已生成则复用
    setWechatLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/wechat?mode=json");
      const data = await res.json();
      if (data.success && data.data?.authUrl) {
        // 动态导入 qrcode 生成 data URL
        const QRCode = await import("qrcode");
        const qrDataUrl = await QRCode.toDataURL(data.data.authUrl, {
          width: 200,
          margin: 2,
          color: { dark: "#000000", light: "#ffffff" },
        });
        setWechatQrData(qrDataUrl);
      } else {
        setError("获取微信登录二维码失败，请重试");
        setTab("sms");
      }
    } catch {
      setError("网络错误，请重试");
      setTab("sms");
    } finally {
      setWechatLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <div className="text-center mb-6">
          <Link href="/" className="inline-block">
            <h1 className="text-2xl font-bold text-gray-900">NIHPLOD</h1>
          </Link>
          <p className="text-gray-500 mt-2">
            {clientName !== "NIHPLOD" ? `登录以授权 ${clientName}` : "登录 NIHPLOD"}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Tab 切换 */}
        <div className="flex border-b mb-6">
          <button
            onClick={() => setTab("sms")}
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === "sms"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            手机验证码登录
          </button>
          <button
            onClick={() => setTab("password")}
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === "password"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            密码登录
          </button>
          <button
            onClick={handleWechatTab}
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === "wechat"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            微信扫码
          </button>
        </div>

        {/* 手机号输入 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">手机号</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
            placeholder="请输入手机号"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>

        {tab === "sms" ? (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">验证码</label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="请输入验证码"
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <button
                  onClick={handleSendCode}
                  disabled={loading || countdown > 0}
                  className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 whitespace-nowrap text-sm"
                >
                  {countdown > 0 ? `${countdown}s` : codeSent ? "重新发送" : "发送验证码"}
                </button>
              </div>
            </div>
            <button
              onClick={handleSmsLogin}
              disabled={loading}
              className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              {loading ? "登录中..." : "登录"}
            </button>
          </>
        ) : tab === "wechat" ? (
          <>
            <div className="flex flex-col items-center py-4">
              {wechatLoading ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                  <p className="text-sm text-gray-500">正在生成二维码...</p>
                </div>
              ) : wechatQrData ? (
                <>
                  <img
                    src={wechatQrData}
                    alt="微信扫码登录"
                    className="w-[200px] h-[200px] rounded-lg border border-gray-200"
                  />
                  <p className="mt-4 text-sm text-gray-600">请使用微信扫一扫登录</p>
                  <p className="mt-1 text-xs text-gray-400">扫码后将在新页面完成授权</p>
                </>
              ) : (
                <p className="text-sm text-gray-500">点击上方"微信扫码"标签获取二维码</p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <button
              onClick={handlePasswordLogin}
              disabled={loading}
              className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              {loading ? "登录中..." : "登录"}
            </button>
          </>
        )}

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            还没有账号？{" "}
            <Link href="/" className="text-blue-600 hover:underline">
              前往注册
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
