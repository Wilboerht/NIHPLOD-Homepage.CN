"use client";

/**
 * 登录表单组件
 */
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface LoginFormProps {
  redirectUrl?: string;
  error?: string;
}

export default function LoginForm({ redirectUrl, error }: LoginFormProps) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(error || "");

  // 倒计时
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // 发送验证码
  const sendCode = async () => {
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setErrorMsg("请输入正确的手机号");
      return;
    }

    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, type: "login" }),
      });

      const data = await res.json();

      if (!data.success) {
        setErrorMsg(data.error?.message || "发送失败");
        return;
      }

      setCountdown(60);
      setErrorMsg("");
    } catch {
      setErrorMsg("网络错误，请重试");
    }
  };

  // 登录
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setErrorMsg("请输入正确的手机号");
      return;
    }

    if (!/^\d{6}$/.test(code)) {
      setErrorMsg("请输入6位验证码");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });

      const data = await res.json();

      if (!data.success) {
        setErrorMsg(data.error?.message || "登录失败");
        return;
      }

      // 登录成功，跳转
      router.push(redirectUrl || "/");
      router.refresh();
    } catch {
      setErrorMsg("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  // 微信登录
  const handleWechatLogin = async () => {
    try {
      const res = await fetch(`/api/auth/wechat?redirect=${encodeURIComponent(redirectUrl || "/")}`);
      const data = await res.json();

      if (data.success) {
        window.location.href = data.data.authUrl;
      } else {
        setErrorMsg(data.error?.message || "获取微信授权失败");
      }
    } catch {
      setErrorMsg("网络错误，请重试");
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8">
      {/* 错误提示 */}
      {errorMsg && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        {/* 手机号 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">手机号</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
            placeholder="请输入手机号"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
          />
        </div>

        {/* 验证码 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">验证码</label>
          <div className="flex gap-3">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="请输入验证码"
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={sendCode}
              disabled={countdown > 0 || phone.length !== 11}
              className="px-4 py-3 bg-pink-100 text-pink-600 rounded-lg font-medium whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed hover:bg-pink-200 transition-colors"
            >
              {countdown > 0 ? `${countdown}s` : "获取验证码"}
            </button>
          </div>
        </div>

        {/* 登录按钮 */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-pink-500 text-white rounded-lg font-medium disabled:opacity-50 hover:bg-pink-600 transition-colors"
        >
          {loading ? "登录中..." : "登录 / 注册"}
        </button>
      </form>

      {/* 分隔线 */}
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 bg-white text-gray-500">其他登录方式</span>
        </div>
      </div>

      {/* 微信登录 */}
      <button
        type="button"
        onClick={handleWechatLogin}
        className="w-full py-3 border border-gray-300 rounded-lg font-medium flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors"
      >
        <svg className="w-5 h-5 text-green-500" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.045c.134 0 .24-.11.24-.245 0-.06-.024-.12-.04-.178l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088-.182-.013-.373-.027-.545-.035h-.06zm-2.89 3.217c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z" />
        </svg>
        <span className="text-gray-700">微信登录</span>
      </button>
    </div>
  );
}

