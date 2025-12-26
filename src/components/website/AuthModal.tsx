"use client";

/**
 * 登录/注册模态框组件 - 优雅品牌风格
 */
import { useState, useEffect } from "react";
import { X, Smartphone, Shield, Sparkles, UserPlus, Lock, KeyRound } from "lucide-react";
import { m, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";

// 登录方式类型
type LoginMethod = "code" | "password";

// 忘记密码步骤类型
type ForgotPasswordStep = "phone" | "code" | "password" | "success";

export function AuthModal() {
  const { activeModal, closeModal, switchToLogin, switchToRegister, switchToForgotPassword, refreshUser } = useAuth();

  return (
    <>
      <LoginModal
        isOpen={activeModal === "login"}
        onClose={closeModal}
        onSwitchToRegister={switchToRegister}
        onSwitchToForgotPassword={switchToForgotPassword}
        onSuccess={refreshUser}
      />
      <RegisterModal
        isOpen={activeModal === "register"}
        onClose={closeModal}
        onSwitchToLogin={switchToLogin}
        onSuccess={refreshUser}
      />
      <ForgotPasswordModal
        isOpen={activeModal === "forgot-password"}
        onClose={closeModal}
        onSwitchToLogin={switchToLogin}
      />
    </>
  );
}

/**
 * 登录模态框
 */
function LoginModal({
  isOpen,
  onClose,
  onSwitchToRegister,
  onSwitchToForgotPassword,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToRegister: () => void;
  onSwitchToForgotPassword: () => void;
  onSuccess: () => Promise<void>;
}) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("code");

  // 关闭时重置表单
  useEffect(() => {
    if (!isOpen) {
      setPhone("");
      setCode("");
      setPassword("");
      setErrorMsg("");
      setLoading(false);
      setLoginMethod("code");
    }
  }, [isOpen]);

  // 倒计时
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // 禁止背景滚动
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

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

  // 验证码登录
  const handleCodeLogin = async () => {
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
      await onSuccess();
      onClose();
    } catch {
      setErrorMsg("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  // 密码登录
  const handlePasswordLogin = async () => {
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setErrorMsg("请输入正确的手机号");
      return;
    }
    if (password.length < 6) {
      setErrorMsg("密码至少6位");
      return;
    }
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/auth/login-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      const data = await res.json();
      if (!data.success) {
        setErrorMsg(data.error?.message || "登录失败");
        return;
      }
      await onSuccess();
      onClose();
    } catch {
      setErrorMsg("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  // 登录
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginMethod === "code") {
      await handleCodeLogin();
    } else {
      await handlePasswordLogin();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* 背景遮罩 */}
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* 模态框内容 */}
          <m.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative z-10 w-full max-w-sm"
          >
            <div className="overflow-hidden rounded-3xl bg-gradient-to-b from-[#FAF9F6] to-white shadow-2xl">
              {/* 顶部装饰 */}
              <div className="relative bg-gradient-to-br from-brand-gold/5 via-brand-gold/10 to-brand-gold/5 px-6 pb-6 pt-8">
                {/* 关闭按钮 */}
                <button
                  onClick={onClose}
                  className="absolute right-3 top-3 rounded-full p-2 text-brand-charcoal/40 transition-colors hover:bg-white/60 hover:text-brand-charcoal/70"
                >
                  <X className="h-4 w-4" />
                </button>

                {/* 标题区域 */}
                <div className="text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gold/10">
                    <Sparkles className="h-6 w-6 text-brand-gold" />
                  </div>
                  <h2 className="font-playfair text-xl font-medium tracking-wide text-brand-charcoal">
                    欢迎回来
                  </h2>
                  <p className="mt-1 text-sm text-brand-charcoal/50">
                    登录您的账户
                  </p>
                </div>
              </div>

              {/* 表单内容 */}
              <div className="px-6 pb-6 pt-5">
                {/* 登录方式切换 */}
                <div className="mb-4 flex rounded-xl bg-brand-charcoal/5 p-1">
                  <button
                    type="button"
                    onClick={() => { setLoginMethod("code"); setErrorMsg(""); }}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-all ${
                      loginMethod === "code"
                        ? "bg-white text-brand-charcoal shadow-sm"
                        : "text-brand-charcoal/50 hover:text-brand-charcoal/70"
                    }`}
                  >
                    <Shield className="h-3.5 w-3.5" />
                    验证码登录
                  </button>
                  <button
                    type="button"
                    onClick={() => { setLoginMethod("password"); setErrorMsg(""); }}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-all ${
                      loginMethod === "password"
                        ? "bg-white text-brand-charcoal shadow-sm"
                        : "text-brand-charcoal/50 hover:text-brand-charcoal/70"
                    }`}
                  >
                    <Lock className="h-3.5 w-3.5" />
                    密码登录
                  </button>
                </div>

                {/* 错误提示 */}
                <AnimatePresence>
                  {errorMsg && (
                    <m.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-4 overflow-hidden rounded-xl bg-red-50 p-3 text-center text-sm text-red-600"
                    >
                      {errorMsg}
                    </m.div>
                  )}
                </AnimatePresence>

                <form onSubmit={handleLogin} className="space-y-4">
                  {/* 手机号 */}
                  <div className="group">
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                        <Smartphone className="h-4 w-4 text-brand-charcoal/30 transition-colors group-focus-within:text-brand-gold" />
                      </div>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                        placeholder="请输入手机号"
                        className="w-full rounded-xl border border-brand-charcoal/10 bg-white py-3.5 pl-11 pr-4 text-brand-charcoal placeholder:text-brand-charcoal/30 focus:border-brand-gold/30 focus:outline-none focus:ring-2 focus:ring-brand-gold/20"
                      />
                    </div>
                  </div>

                  {/* 验证码输入 - 仅验证码登录时显示 */}
                  {loginMethod === "code" && (
                    <div className="group">
                      <div className="relative flex gap-2">
                        <div className="relative flex-1">
                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                            <KeyRound className="h-4 w-4 text-brand-charcoal/30 transition-colors group-focus-within:text-brand-gold" />
                          </div>
                          <input
                            type="text"
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                            placeholder="请输入验证码"
                            className="w-full rounded-xl border border-brand-charcoal/10 bg-white py-3.5 pl-11 pr-4 text-brand-charcoal placeholder:text-brand-charcoal/30 focus:border-brand-gold/30 focus:outline-none focus:ring-2 focus:ring-brand-gold/20"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={sendCode}
                          disabled={countdown > 0 || phone.length !== 11}
                          className="shrink-0 rounded-xl border border-brand-gold/20 bg-brand-gold/5 px-4 py-3.5 text-sm font-medium text-brand-gold transition-all hover:bg-brand-gold/10 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {countdown > 0 ? `${countdown}s` : "获取验证码"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 密码输入 - 仅密码登录时显示 */}
                  {loginMethod === "password" && (
                    <div className="group">
                      <div className="relative">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                          <Lock className="h-4 w-4 text-brand-charcoal/30 transition-colors group-focus-within:text-brand-gold" />
                        </div>
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="请输入密码"
                          maxLength={32}
                          className="w-full rounded-xl border border-brand-charcoal/10 bg-white py-3.5 pl-11 pr-4 text-brand-charcoal placeholder:text-brand-charcoal/30 focus:border-brand-gold/30 focus:outline-none focus:ring-2 focus:ring-brand-gold/20"
                        />
                      </div>
                      {/* 忘记密码链接 */}
                      <div className="mt-2 text-right">
                        <button
                          type="button"
                          onClick={onSwitchToForgotPassword}
                          className="text-xs text-brand-charcoal/50 hover:text-brand-gold"
                        >
                          忘记密码？
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 登录按钮 */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-brand-gold to-brand-gold/90 py-3.5 font-medium text-white shadow-lg shadow-brand-gold/20 transition-all hover:shadow-xl hover:shadow-brand-gold/30 disabled:opacity-60"
                  >
                    <span className="relative z-10">
                      {loading ? "登录中..." : "登录"}
                    </span>
                  </button>
                </form>

                {/* 切换到注册 */}
                <p className="mt-5 text-center text-sm text-brand-charcoal/50">
                  还没有账户？
                  <button
                    type="button"
                    onClick={onSwitchToRegister}
                    className="ml-1 font-medium text-brand-gold hover:underline"
                  >
                    立即注册
                  </button>
                </p>
              </div>
            </div>
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/**
 * 注册模态框
 */
function RegisterModal({
  isOpen,
  onClose,
  onSwitchToLogin,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToLogin: () => void;
  onSuccess: () => Promise<void>;
}) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [agreed, setAgreed] = useState(false);

  // 关闭时重置表单
  useEffect(() => {
    if (!isOpen) {
      setPhone("");
      setCode("");
      setPassword("");
      setConfirmPassword("");
      setErrorMsg("");
      setLoading(false);
      setAgreed(false);
    }
  }, [isOpen]);

  // 倒计时
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // 禁止背景滚动
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

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
        body: JSON.stringify({ phone, type: "register" }),
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

  // 注册
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      setErrorMsg("请先同意用户协议和隐私政策");
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setErrorMsg("请输入正确的手机号");
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setErrorMsg("请输入6位验证码");
      return;
    }
    if (password.length < 6) {
      setErrorMsg("密码至少6位");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg("两次密码不一致");
      return;
    }
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code, password, confirmPassword }),
      });
      const data = await res.json();
      if (!data.success) {
        setErrorMsg(data.error?.message || "注册失败");
        return;
      }
      await onSuccess();
      onClose();
    } catch {
      setErrorMsg("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* 背景遮罩 */}
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* 模态框内容 */}
          <m.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative z-10 w-full max-w-sm"
          >
            <div className="overflow-hidden rounded-3xl bg-gradient-to-b from-[#FAF9F6] to-white shadow-2xl">
              {/* 顶部装饰 */}
              <div className="relative bg-gradient-to-br from-blue-50 via-blue-100/50 to-blue-50 px-6 pb-6 pt-8">
                {/* 关闭按钮 */}
                <button
                  onClick={onClose}
                  className="absolute right-3 top-3 rounded-full p-2 text-brand-charcoal/40 transition-colors hover:bg-white/60 hover:text-brand-charcoal/70"
                >
                  <X className="h-4 w-4" />
                </button>

                {/* 标题区域 */}
                <div className="text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10">
                    <UserPlus className="h-6 w-6 text-blue-600" />
                  </div>
                  <h2 className="font-playfair text-xl font-medium tracking-wide text-brand-charcoal">
                    创建账户
                  </h2>
                  <p className="mt-1 text-sm text-brand-charcoal/50">
                    开启您的护肤之旅
                  </p>
                </div>
              </div>

              {/* 表单内容 */}
              <div className="px-6 pb-6 pt-5">
                {/* 错误提示 */}
                <AnimatePresence>
                  {errorMsg && (
                    <m.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-4 overflow-hidden rounded-xl bg-red-50 p-3 text-center text-sm text-red-600"
                    >
                      {errorMsg}
                    </m.div>
                  )}
                </AnimatePresence>

                <form onSubmit={handleRegister} className="space-y-4">
                  {/* 手机号 */}
                  <div className="group">
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                        <Smartphone className="h-4 w-4 text-brand-charcoal/30 transition-colors group-focus-within:text-blue-600" />
                      </div>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                        placeholder="请输入手机号"
                        className="w-full rounded-xl border border-brand-charcoal/10 bg-white py-3.5 pl-11 pr-4 text-brand-charcoal placeholder:text-brand-charcoal/30 focus:border-blue-500/30 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                  </div>

                  {/* 验证码 */}
                  <div className="group">
                    <div className="relative flex gap-2">
                      <div className="relative flex-1">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                          <Shield className="h-4 w-4 text-brand-charcoal/30 transition-colors group-focus-within:text-blue-600" />
                        </div>
                        <input
                          type="text"
                          value={code}
                          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          placeholder="请输入验证码"
                          className="w-full rounded-xl border border-brand-charcoal/10 bg-white py-3.5 pl-11 pr-4 text-brand-charcoal placeholder:text-brand-charcoal/30 focus:border-blue-500/30 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={sendCode}
                        disabled={countdown > 0 || phone.length !== 11}
                        className="shrink-0 rounded-xl border border-blue-500/20 bg-blue-50 px-4 py-3.5 text-sm font-medium text-blue-600 transition-all hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {countdown > 0 ? `${countdown}s` : "获取验证码"}
                      </button>
                    </div>
                  </div>

                  {/* 密码 */}
                  <div className="group">
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                        <Lock className="h-4 w-4 text-brand-charcoal/30 transition-colors group-focus-within:text-blue-600" />
                      </div>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="请设置密码（至少6位）"
                        maxLength={32}
                        className="w-full rounded-xl border border-brand-charcoal/10 bg-white py-3.5 pl-11 pr-4 text-brand-charcoal placeholder:text-brand-charcoal/30 focus:border-blue-500/30 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                  </div>

                  {/* 确认密码 */}
                  <div className="group">
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                        <Lock className="h-4 w-4 text-brand-charcoal/30 transition-colors group-focus-within:text-blue-600" />
                      </div>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="请确认密码"
                        maxLength={32}
                        className="w-full rounded-xl border border-brand-charcoal/10 bg-white py-3.5 pl-11 pr-4 text-brand-charcoal placeholder:text-brand-charcoal/30 focus:border-blue-500/30 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                  </div>

                  {/* 协议勾选 */}
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs leading-relaxed text-brand-charcoal/50">
                      我已阅读并同意
                      <a href="/terms" className="text-blue-600 hover:underline">《用户协议》</a>
                      和
                      <a href="/privacy" className="text-blue-600 hover:underline">《隐私政策》</a>
                    </span>
                  </label>

                  {/* 注册按钮 */}
                  <button
                    type="submit"
                    disabled={loading || !agreed}
                    className="relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 py-3.5 font-medium text-white shadow-lg shadow-blue-500/20 transition-all hover:shadow-xl hover:shadow-blue-500/30 disabled:opacity-60"
                  >
                    <span className="relative z-10">
                      {loading ? "注册中..." : "注册"}
                    </span>
                  </button>
                </form>

                {/* 切换到登录 */}
                <p className="mt-5 text-center text-sm text-brand-charcoal/50">
                  已有账户？
                  <button
                    type="button"
                    onClick={onSwitchToLogin}
                    className="ml-1 font-medium text-brand-gold hover:underline"
                  >
                    立即登录
                  </button>
                </p>
              </div>
            </div>
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/**
 * 忘记密码模态框
 */
function ForgotPasswordModal({
  isOpen,
  onClose,
  onSwitchToLogin,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToLogin: () => void;
}) {
  const [step, setStep] = useState<ForgotPasswordStep>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // 关闭时重置表单
  useEffect(() => {
    if (!isOpen) {
      setStep("phone");
      setPhone("");
      setCode("");
      setPassword("");
      setConfirmPassword("");
      setErrorMsg("");
      setLoading(false);
    }
  }, [isOpen]);

  // 倒计时
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // 禁止背景滚动
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  // 发送验证码
  const sendCode = async () => {
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setErrorMsg("请输入正确的手机号");
      return;
    }
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, type: "reset" }),
      });
      const data = await res.json();
      if (!data.success) {
        setErrorMsg(data.error?.message || "发送失败");
        return;
      }
      setCountdown(60);
      setStep("code");
    } catch {
      setErrorMsg("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  // 验证验证码
  const verifyCode = () => {
    if (!/^\d{6}$/.test(code)) {
      setErrorMsg("请输入6位验证码");
      return;
    }
    setErrorMsg("");
    setStep("password");
  };

  // 重置密码
  const resetPassword = async () => {
    if (password.length < 6) {
      setErrorMsg("密码至少6位");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg("两次密码不一致");
      return;
    }
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code, password, confirmPassword }),
      });
      const data = await res.json();
      if (!data.success) {
        setErrorMsg(data.error?.message || "重置失败");
        return;
      }
      setStep("success");
    } catch {
      setErrorMsg("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };



  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* 背景遮罩 */}
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* 模态框内容 */}
          <m.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative z-10 w-full max-w-sm"
          >
            <div className="overflow-hidden rounded-3xl bg-gradient-to-b from-[#FAF9F6] to-white shadow-2xl">
              {/* 顶部装饰 */}
              <div className="relative bg-gradient-to-br from-amber-50 via-amber-100/50 to-amber-50 px-6 pb-6 pt-8">
                {/* 关闭按钮 */}
                <button
                  onClick={onClose}
                  className="absolute right-3 top-3 rounded-full p-2 text-brand-charcoal/40 transition-colors hover:bg-white/60 hover:text-brand-charcoal/70"
                >
                  <X className="h-4 w-4" />
                </button>

                {/* 标题区域 */}
                <div className="text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10">
                    <KeyRound className="h-6 w-6 text-amber-600" />
                  </div>
                  <h2 className="font-playfair text-xl font-medium tracking-wide text-brand-charcoal">
                    找回密码
                  </h2>
                  <p className="mt-1 text-sm text-brand-charcoal/50">
                    {step === "phone" && "请输入您的手机号"}
                    {step === "code" && "请输入验证码"}
                    {step === "password" && "请设置新密码"}
                    {step === "success" && "密码重置成功"}
                  </p>
                </div>
              </div>

              {/* 表单内容 */}
              <div className="px-6 pb-6 pt-5">
                {/* 错误提示 */}
                <AnimatePresence>
                  {errorMsg && (
                    <m.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-4 overflow-hidden rounded-xl bg-red-50 p-3 text-center text-sm text-red-600"
                    >
                      {errorMsg}
                    </m.div>
                  )}
                </AnimatePresence>

                {/* 步骤 1: 输入手机号 */}
                {step === "phone" && (
                  <div className="space-y-4">
                    <div className="group relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                        <Smartphone className="h-4 w-4 text-brand-charcoal/30" />
                      </div>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                        placeholder="请输入手机号"
                        className="w-full rounded-xl border border-brand-charcoal/10 bg-white py-3.5 pl-11 pr-4 text-brand-charcoal placeholder:text-brand-charcoal/30 focus:border-amber-500/30 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={sendCode}
                      disabled={loading || phone.length !== 11}
                      className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-3.5 font-medium text-white shadow-lg shadow-amber-500/20 disabled:opacity-60"
                    >
                      {loading ? "发送中..." : "获取验证码"}
                    </button>
                  </div>
                )}

                {/* 步骤 2: 输入验证码 */}
                {step === "code" && (
                  <div className="space-y-4">
                    <p className="text-center text-sm text-brand-charcoal/60">
                      验证码已发送至 {phone.slice(0, 3)}****{phone.slice(-4)}
                    </p>
                    <div className="group relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                        <Shield className="h-4 w-4 text-brand-charcoal/30" />
                      </div>
                      <input
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="请输入6位验证码"
                        className="w-full rounded-xl border border-brand-charcoal/10 bg-white py-3.5 pl-11 pr-4 text-brand-charcoal placeholder:text-brand-charcoal/30 focus:border-amber-500/30 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setStep("phone")}
                        className="flex-1 rounded-xl border border-brand-charcoal/10 py-3.5 font-medium text-brand-charcoal/70 hover:bg-brand-charcoal/5"
                      >
                        返回
                      </button>
                      <button
                        type="button"
                        onClick={verifyCode}
                        disabled={code.length !== 6}
                        className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-3.5 font-medium text-white shadow-lg shadow-amber-500/20 disabled:opacity-60"
                      >
                        下一步
                      </button>
                    </div>
                    <p className="text-center text-sm text-brand-charcoal/50">
                      {countdown > 0 ? (
                        `${countdown}秒后可重新发送`
                      ) : (
                        <button type="button" onClick={sendCode} className="text-amber-600 hover:underline">
                          重新发送验证码
                        </button>
                      )}
                    </p>
                  </div>
                )}

                {/* 步骤 3: 设置新密码 */}
                {step === "password" && (
                  <div className="space-y-4">
                    <div className="group relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                        <Lock className="h-4 w-4 text-brand-charcoal/30" />
                      </div>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="请输入新密码（至少6位）"
                        maxLength={32}
                        className="w-full rounded-xl border border-brand-charcoal/10 bg-white py-3.5 pl-11 pr-4 text-brand-charcoal placeholder:text-brand-charcoal/30 focus:border-amber-500/30 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>
                    <div className="group relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                        <Lock className="h-4 w-4 text-brand-charcoal/30" />
                      </div>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="请确认新密码"
                        maxLength={32}
                        className="w-full rounded-xl border border-brand-charcoal/10 bg-white py-3.5 pl-11 pr-4 text-brand-charcoal placeholder:text-brand-charcoal/30 focus:border-amber-500/30 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={resetPassword}
                      disabled={loading || password.length < 6}
                      className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-3.5 font-medium text-white shadow-lg shadow-amber-500/20 disabled:opacity-60"
                    >
                      {loading ? "重置中..." : "重置密码"}
                    </button>
                  </div>
                )}

                {/* 步骤 4: 成功 */}
                {step === "success" && (
                  <div className="space-y-4 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                      <Sparkles className="h-8 w-8 text-emerald-600" />
                    </div>
                    <p className="text-brand-charcoal/70">
                      密码重置成功，请使用新密码登录
                    </p>
                    <button
                      type="button"
                      onClick={onSwitchToLogin}
                      className="w-full rounded-xl bg-gradient-to-r from-brand-gold to-brand-gold/90 py-3.5 font-medium text-white shadow-lg shadow-brand-gold/20"
                    >
                      去登录
                    </button>
                  </div>
                )}

                {/* 返回登录 */}
                {step !== "success" && (
                  <p className="mt-5 text-center text-sm text-brand-charcoal/50">
                    想起密码了？
                    <button
                      type="button"
                      onClick={onSwitchToLogin}
                      className="ml-1 font-medium text-brand-gold hover:underline"
                    >
                      返回登录
                    </button>
                  </p>
                )}
              </div>
            </div>
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );
}
