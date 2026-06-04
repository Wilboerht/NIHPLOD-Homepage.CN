"use client";

/**
 * 登录/注册模态框组件 - 优雅品牌风格
 */
import { useState, useEffect } from "react";
import Image from "next/image";
import { X, Smartphone, Shield, Lock, KeyRound, CheckCircle2, Check, Headset, ChevronLeft } from "lucide-react";
import { Link } from "next-view-transitions";
import { m, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { useIsMobile } from "@/hooks/useMediaQuery";

// 登录方式类型
type LoginMethod = "code" | "password";

// 忘记密码步骤类型
type ForgotPasswordStep = "phone" | "code" | "password" | "success";

export function AuthModal() {
  const { activeModal, closeModal, switchToLogin, switchToRegister, switchToForgotPassword, refreshUser, openUserCenter } = useAuth();

  return (
    <>
      <LoginModal
        isOpen={activeModal === "login"}
        onClose={closeModal}
        onSwitchToRegister={switchToRegister}
        onSwitchToForgotPassword={switchToForgotPassword}
        onSuccess={async () => {
          await refreshUser(true);
          openUserCenter();
        }}
      />
      <RegisterModal
        isOpen={activeModal === "register"}
        onClose={closeModal}
        onSwitchToLogin={switchToLogin}
        onSuccess={async () => {
          await refreshUser(true);
          openUserCenter();
        }}
      />
      <ForgotPasswordModal
        isOpen={activeModal === "forgot-password"}
        onClose={closeModal}
        onSwitchToLogin={switchToLogin}
      />
      <WechatBindModal
        isOpen={activeModal === "wechat-bind"}
        onClose={closeModal}
        onSuccess={async () => {
          await refreshUser(true);
          openUserCenter();
        }}
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
  onSwitchToRegister: _onSwitchToRegister,
  onSwitchToForgotPassword,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToRegister: () => void;
  onSwitchToForgotPassword: () => void;
  onSuccess: () => Promise<void>;
}) {
  const { openContact: _openContact } = useAuth();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("password");
  const [agreed, setAgreed] = useState(false);
  const toast = useToast();

  // 关闭时重置表单
  useEffect(() => {
    if (!isOpen) {
      setPhone("");
      setCode("");
      setPassword("");
      setLoading(false);
      setLoginMethod("password");
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

  const isMobile = useIsMobile();

  // 禁止背景滚动（移动端使用 fixed 定位防止 iOS 弹性滚动）
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      if (isMobile) {
        const scrollY = window.scrollY;
        document.body.style.position = "fixed";
        document.body.style.width = "100%";
        document.body.style.top = `-${scrollY}px`;
      }
    } else {
      document.body.style.overflow = "unset";
      if (isMobile) {
        const scrollY = document.body.style.top;
        document.body.style.position = "";
        document.body.style.width = "";
        document.body.style.top = "";
        if (scrollY) {
          window.scrollTo(0, parseInt(scrollY) * -1);
        }
      }
    }
    return () => {
      document.body.style.overflow = "unset";
      if (isMobile) {
        document.body.style.position = "";
        document.body.style.width = "";
        document.body.style.top = "";
      }
    };
  }, [isOpen, isMobile]);

  // 发送验证码
  const sendCode = async () => {
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      toast.error("请输入正确的手机号");
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
        toast.error(data.error?.message || "发送失败");
        return;
      }
      setCountdown(60);
    } catch {
      toast.error("网络错误，请重试");
    }
  };

  // 验证码登录
  const handleCodeLogin = async () => {
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      toast.error("请输入正确的手机号");
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      toast.error("请输入6位验证码");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error?.message || "登录失败");
        return;
      }
      await onSuccess();
      onClose();
    } catch {
      toast.error("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  // 密码登录
  const handlePasswordLogin = async () => {
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      toast.error("请输入正确的手机号");
      return;
    }
    if (password.length < 6) {
      toast.error("密码至少6位");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error?.message || "登录失败");
        return;
      }
      await onSuccess();
      onClose();
    } catch {
      toast.error("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  // 登录
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      toast.warning("请先同意用户协议和隐私政策");
      return;
    }
    if (loginMethod === "code") {
      await handleCodeLogin();
    } else {
      await handlePasswordLogin();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-x-0 top-0 z-[9999] flex items-center justify-center h-[100dvh] p-4 md:pt-4 md:px-4 md:pb-4">
          {/* 背景遮罩 */}
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-[#F8F7F3] md:bg-black/40 md:backdrop-blur-sm"
            onClick={onClose}
          />

          {/* 模态框内容 */}
          <m.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative z-10 w-full h-full md:w-full md:max-w-[1100px] md:h-[680px] flex items-center max-h-none"
          >
            <div className="relative w-full h-full overflow-hidden rounded-none md:rounded-[2.5rem] bg-transparent md:bg-black/10 shadow-none md:shadow-2xl md:p-6 md:flex md:items-stretch">
              {/* 背景图片区域 - 铺满整个卡片 */}
              <div className="absolute inset-0 z-0 hidden md:block">
                <Image
                  src="/images/login-background.webp"
                  alt="Auth Background"
                  fill
                  className="object-cover"
                  priority
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-transparent" />
              </div>

              {/* 关闭按钮 */}
              <button
                onClick={onClose}
                className="hidden md:flex absolute right-6 top-6 z-50 h-9 w-9 items-center justify-center rounded-full bg-brand-charcoal/5 md:bg-white/40 text-brand-charcoal/40 backdrop-blur-md transition-all hover:bg-brand-charcoal/10 md:hover:bg-white/80 hover:text-brand-charcoal/70"
              >
                <X className="h-5 w-5" />
              </button>

              {/* 浮动表单区域 */}
              <div className="relative z-10 w-full md:w-[440px] flex flex-col items-stretch h-full justify-center">
                <div className="flex-1 flex flex-col justify-center md:justify-start rounded-none md:rounded-[2.5rem] bg-transparent md:bg-white/65 backdrop-blur-none md:backdrop-blur-xl shadow-none md:shadow-[0_8px_32px_0_rgba(0,0,0,0.1)] border-none md:border md:border-white/50 overflow-hidden">
                  {/* 顶部装饰 - 固定 */}
                  <div className="hidden md:block relative px-6 md:px-8 pb-3 pt-6 md:pb-5 md:pt-10 text-center shrink-0">
                    <div className="mx-auto mb-4 flex justify-center">
                      <Image
                        src="/images/NIHPLOD-logo.svg"
                        alt="NIHPLOD Logo"
                        width={120}
                        className="object-contain h-auto w-[120px]"
                        height={48}
                        priority
                      />
                    </div>
                    <h2 className="text-2xl font-semibold tracking-[0.05em] text-brand-charcoal">
                      欢迎回来
                    </h2>
                  </div>

                  {/* 手机端顶部栏 */}
                  <div className="md:hidden flex-shrink-0 h-[56px] w-full flex items-center relative">
                    <button
                      onClick={onClose}
                      className="absolute left-0 top-0 bottom-0 flex items-center justify-center px-4 py-[10px]"
                    >
                      <ChevronLeft className="h-6 w-6 text-[#00263E]" />
                    </button>
                  </div>

                  {/* 表单内容 - 可滚动 */}
                  <div className="flex-1 overflow-y-auto px-6 md:px-10 pt-6 pb-6 md:pb-4 scrollbar-hide flex flex-col justify-center">

                    {/* ===== 手机端极简全屏登录 ===== */}
                    <div className="md:hidden flex flex-col gap-8">
                      <div className="flex justify-center">
                        <Image
                          src="/images/NIHPLOD-logo.svg"
                          alt="NIHPLOD Logo"
                          width={140}
                          height={56}
                          className="object-contain h-auto w-[140px]"
                          priority
                        />
                      </div>
                      <form onSubmit={handleLogin} className="w-full space-y-6">
                        <div>
                          <input
                            type="tel"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            autoComplete="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                            placeholder="手机号"
                            className="w-full bg-transparent border-0 border-b border-brand-charcoal/25 rounded-none py-3 px-0 text-base tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/40 placeholder:text-sm placeholder:tracking-wider focus:outline-none focus:border-brand-gold/60 transition-colors"
                          />
                        </div>

                        <div>
                          <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="密码"
                            maxLength={32}
                            className="w-full bg-transparent border-0 border-b border-brand-charcoal/25 rounded-none py-3 px-0 text-base tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/40 placeholder:text-sm placeholder:tracking-wider focus:outline-none focus:border-brand-gold/60 transition-colors"
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={onSwitchToForgotPassword}
                            className="self-end inline-flex h-7 min-h-0 items-center gap-1.5 text-xs tracking-wider text-brand-charcoal/50 hover:text-brand-charcoal transition-colors"
                          >
                            <KeyRound className="h-3 w-3" strokeWidth={2} />
                            找回密码
                          </button>
                        </div>

                        <label className="flex cursor-pointer items-center gap-2.5 group/agreement">
                          <div className="relative flex-shrink-0">
                            <input
                              type="checkbox"
                              checked={agreed}
                              onChange={(e) => setAgreed(e.target.checked)}
                              className="peer sr-only"
                            />
                            <div className="h-4 w-4 rounded border border-brand-charcoal/25 bg-transparent transition-all peer-checked:bg-brand-gold peer-checked:border-brand-gold" />
                            <Check className="absolute inset-0 m-auto h-3 w-3 scale-0 text-white transition-transform peer-checked:scale-100" strokeWidth={3} />
                          </div>
                          <span className="text-xs text-brand-charcoal/50 tracking-wide">
                            我已阅读并同意
                            <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline decoration-brand-charcoal/20 underline-offset-2 hover:text-brand-charcoal transition-colors">《用户协议》</a>
                            和
                            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline decoration-brand-charcoal/20 underline-offset-2 hover:text-brand-charcoal transition-colors">《隐私政策》</a>
                          </span>
                        </label>

                        <div className="pt-2">
                          <button
                            type="submit"
                            disabled={loading || !agreed}
                            className="w-full py-3.5 text-sm font-medium tracking-[0.2em] text-brand-charcoal border border-brand-charcoal/25 hover:bg-brand-charcoal/[0.03] active:scale-[0.98] transition-all disabled:opacity-40"
                          >
                            <span className="relative z-10 flex items-center justify-center gap-2">
                              {loading ? (
                                <div className="h-4 w-4 border-2 border-brand-charcoal/20 border-t-brand-charcoal rounded-full animate-spin" />
                              ) : "立即登录"}
                            </span>
                          </button>
                        </div>
                      </form>

                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            _openContact();
                          }}
                          className="inline-flex h-7 min-h-0 items-center justify-center text-xs text-brand-charcoal/40 tracking-wide hover:text-brand-charcoal/70 transition-colors"
                        >
                          还没有账户？联系我们
                        </button>
                      </div>
                    </div>

                    {/* ===== PC端原有卡片布局 ===== */}
                    <div className="hidden md:block">
                      {/* 登录方式切换 */}
                    <div className="mb-6 flex justify-center gap-10 pb-2">
                      <button
                        type="button"
                        onClick={() => { setLoginMethod("password"); }}
                        className={`relative py-1 text-sm font-semibold tracking-wide transition-all ${loginMethod === "password"
                          ? "text-brand-charcoal"
                          : "text-brand-charcoal/40 hover:text-brand-charcoal/60"
                          }`}
                      >
                        密码登录
                        {loginMethod === "password" && (
                          <m.div layoutId="activeTab" className="absolute -bottom-[9px] left-0 right-0 h-0.5 bg-brand-gold" />
                        )}
                      </button>
                      {/* 验证码登录按钮暂时隐藏 */}
                      {/*
                      <button
                        type="button"
                        onClick={() => { setLoginMethod("code"); }}
                        className={`relative py-1 text-sm font-semibold tracking-wide transition-all ${loginMethod === "code"
                          ? "text-brand-charcoal"
                          : "text-brand-charcoal/40 hover:text-brand-charcoal/60"
                          }`}
                      >
                        验证码登录
                        {loginMethod === "code" && (
                          <m.div layoutId="activeTab" className="absolute -bottom-[9px] left-0 right-0 h-0.5 bg-brand-gold" />
                        )}
                      </button>
                      */}
                    </div>

                    <form onSubmit={handleLogin} className="space-y-2.5">
                      {/* 手机号 */}
                      <div className="group">
                        <div className="relative">
                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                            <Smartphone className="h-4 w-4 text-brand-charcoal/50 transition-colors group-focus-within:text-brand-charcoal stroke-[2px]" />
                          </div>
                          <input
                            type="tel"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            autoComplete="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                            placeholder="手机号"
                            className="w-full bg-black/5 md:bg-white/20 border border-black/10 md:border-white/30 rounded-xl py-2.5 md:py-3.5 pl-11 pr-4 text-sm tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/50 focus:bg-black/10 md:focus:bg-white/40 focus:border-brand-gold/60 focus:outline-none transition-all"
                          />
                        </div>
                      </div>

                      {/* 输入区容器 - 设置固定/最小高度避免切换时抖动 */}
                      <div className="min-h-[72px] flex flex-col justify-start space-y-3">
                        {/* 验证码输入 - 仅验证码登录时显示 */}
                        {loginMethod === "code" && (
                          <div className="group animate-fade-scale-in">
                            <div className="relative flex gap-2">
                              <div className="relative flex-1">
                                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                                  <KeyRound className="h-4 w-4 text-brand-charcoal/50 transition-colors group-focus-within:text-brand-charcoal stroke-[2px]" />
                                </div>
                                <input
                                  type="text"
                                  value={code}
                                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                  placeholder="验证码"
                                  className="w-full bg-black/5 md:bg-white/20 border border-black/10 md:border-white/30 rounded-xl py-3.5 pl-11 pr-4 text-sm tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/50 focus:bg-black/10 md:focus:bg-white/40 focus:border-brand-gold/60 focus:outline-none transition-all"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={sendCode}
                                disabled={countdown > 0 || phone.length !== 11}
                                className="shrink-0 px-4 rounded-xl bg-black/5 md:bg-white/20 border border-black/10 md:border-white/30 text-[14px] font-semibold text-brand-gold transition-all hover:bg-black/10 md:hover:bg-white/40 disabled:opacity-30"
                              >
                                {countdown > 0 ? `${countdown}s` : "获取验证码"}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* 密码输入 - 仅密码登录时显示 */}
                        {loginMethod === "password" && (
                          <div className="group space-y-2 animate-fade-scale-in">
                            <div className="relative">
                              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                                <Lock className="h-4 w-4 text-brand-charcoal/50 transition-colors group-focus-within:text-brand-charcoal stroke-[2px]" />
                              </div>
                              <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="密码"
                                maxLength={32}
                                className="w-full bg-black/5 md:bg-white/20 border border-black/10 md:border-white/30 rounded-xl py-2.5 md:py-3.5 pl-11 pr-4 text-sm tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/50 focus:bg-black/10 md:focus:bg-white/40 focus:border-brand-gold/60 focus:outline-none transition-all"
                              />
                            </div>
                            {/* 忘记密码链接 */}
                            <button
                              type="button"
                              onClick={onSwitchToForgotPassword}
                              className="self-end text-xs font-medium text-brand-charcoal/50 hover:text-brand-gold transition-colors"
                            >
                              找回密码
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 协议勾选 */}
                      <label className="flex cursor-pointer items-start gap-3 group/agreement pb-1">
                        <div className="relative mt-0.5">
                          <input
                            type="checkbox"
                            checked={agreed}
                            onChange={(e) => setAgreed(e.target.checked)}
                            className="peer sr-only"
                          />
                          <div className="h-4 w-4 rounded border border-black/20 md:border-white/40 bg-black/5 md:bg-white/10 backdrop-blur-sm transition-all peer-checked:bg-brand-gold peer-checked:border-brand-gold" />
                          <Check className="absolute inset-0 h-4 w-4 scale-0 text-white transition-transform peer-checked:scale-75" strokeWidth={4} />
                        </div>
                        <span className="text-[12px] leading-relaxed text-brand-charcoal/60 select-none">
                          我已阅读并同意
                          <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-brand-charcoal/80 hover:text-brand-charcoal mx-0.5 underline decoration-brand-charcoal/20 underline-offset-4">《用户协议》</a>
                          和
                          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-brand-charcoal/80 hover:text-brand-charcoal mx-0.5 underline decoration-brand-charcoal/20 underline-offset-4">《隐私政策》</a>
                        </span>
                      </label>

                      {/* 登录按钮 */}
                      <button
                        type="submit"
                        disabled={loading || !agreed}
                        className="group relative w-full overflow-hidden rounded-xl bg-brand-gold py-3 text-sm font-bold uppercase tracking-[0.2em] text-white shadow-md shadow-brand-gold/15 transition-all hover:bg-brand-gold-dark hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                      >
                        <span className="relative z-10 flex items-center justify-center gap-2">
                          {loading ? (
                            <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : "立即登录"}
                        </span>
                      </button>

                      {/* 分割线 - 使用 flex 布局避免线条穿透文字 (已隐藏第三方登录) */}
                      {/*
                      <div className="my-6 flex items-center gap-4">
                        <div className="h-px flex-1 bg-black/5 md:bg-white/20"></div>
                        <span className="text-xs text-brand-charcoal/30 whitespace-nowrap">其他登录方式</span>
                        <div className="h-px flex-1 bg-black/5 md:bg-white/20"></div>
                      </div>

                      // 微信登录按钮
                      <button
                        type="button"
                        onClick={handleWechatLogin}
                        disabled={loading}
                        className="w-full py-3.5 border border-black/5 md:border-white/30 rounded-xl font-semibold flex items-center justify-center gap-2.5 transition-all hover:bg-black/[0.02] md:hover:bg-white/10 active:scale-[0.98] disabled:opacity-50"
                      >
                        <svg className="w-5 h-5 text-[#07C160]" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.045c.134 0 .24-.11.24-.245 0-.06-.024-.12-.04-.178l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088-.182-.013-.373-.027-.545-.035h-.06zm-2.89 3.217c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z" />
                        </svg>
                        <span className="text-brand-charcoal/70 tracking-wide text-sm">微信账号登录</span>
                      </button>
                      */}
                    </form>
                    </div>{/* 关闭 PC端 hidden md:block */}
                  </div>

                  {/* 手机端页脚 */}
                  <div className="md:hidden flex-shrink-0 pt-4 pb-4 text-center mx-6">
                    <p className="text-[10px] font-medium tracking-[0.12em] text-[rgba(123,114,108,0.3)] uppercase">
                      &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
                    </p>
                  </div>

                  {/* 底部导航 - 固定（PC端 only） */}
                  <div className="hidden md:block shrink-0 border-t border-black/5 md:border-white/20 bg-black/[0.02] md:bg-white/10 px-6 md:px-10 py-4 text-center">
                    <p className="text-xs text-brand-charcoal/60 flex items-center justify-center">
                      还没有账户？
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          _openContact();
                        }}
                        className="ml-1 inline-flex items-center gap-1 font-medium text-brand-charcoal/60 hover:text-brand-charcoal transition-all"
                      >
                        <Headset className="h-3.5 w-3.5" />
                        联系我们
                      </button>
                    </p>
                  </div>
                </div>
              </div>

              {/* 右侧品牌展示区域 - 桌面端 */}
              <div className="relative z-10 hidden md:flex flex-1 flex-col items-center justify-center">
                <div className="text-center space-y-6">
                  <div className="space-y-2">
                    <p className="text-[2.5rem] font-light tracking-[0.15em] text-brand-gold">
                      精简护肤
                    </p>
                    <p className="text-[2.5rem] font-light tracking-[0.15em] text-white/90">
                      减法美学
                    </p>
                  </div>
                  <div className="flex flex-col items-center gap-1 pt-4">
                    <Image
                      src="/images/NIHPLOD-logo.svg"
                      alt="NIHPLOD"
                      width={120}
                      height={30}
                      className="opacity-90 brightness-0 invert"
                    />
                  </div>
                </div>
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
  const [agreed, setAgreed] = useState(false);
  const toast = useToast();

  // 关闭时重置表单
  useEffect(() => {
    if (!isOpen) {
      setPhone("");
      setCode("");
      setPassword("");
      setConfirmPassword("");
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

  const isMobile = useIsMobile();

  // 禁止背景滚动（移动端使用 fixed 定位防止 iOS 弹性滚动）
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      if (isMobile) {
        const scrollY = window.scrollY;
        document.body.style.position = "fixed";
        document.body.style.width = "100%";
        document.body.style.top = `-${scrollY}px`;
      }
    } else {
      document.body.style.overflow = "unset";
      if (isMobile) {
        const scrollY = document.body.style.top;
        document.body.style.position = "";
        document.body.style.width = "";
        document.body.style.top = "";
        if (scrollY) {
          window.scrollTo(0, parseInt(scrollY) * -1);
        }
      }
    }
    return () => {
      document.body.style.overflow = "unset";
      if (isMobile) {
        document.body.style.position = "";
        document.body.style.width = "";
        document.body.style.top = "";
      }
    };
  }, [isOpen, isMobile]);

  // 发送验证码
  const sendCode = async () => {
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      toast.error("请输入正确的手机号");
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
        toast.error(data.error?.message || "发送失败");
        return;
      }
      setCountdown(60);
    } catch {
      toast.error("网络错误，请重试");
    }
  };

  // 注册
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      toast.warning("请先同意用户协议和隐私政策");
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      toast.error("请输入正确的手机号");
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      toast.error("请输入6位验证码");
      return;
    }
    if (password.length < 6) {
      toast.error("密码至少6位");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("两次密码不一致");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code, password, confirmPassword }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error?.message || "注册失败");
        return;
      }
      await onSuccess();
      onClose();
    } catch {
      toast.error("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-x-0 top-0 z-[9999] flex items-center justify-center h-[100dvh] p-4 md:pt-4 md:px-4 md:pb-4">
          {/* 背景遮罩 */}
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-[#F8F7F3] md:bg-black/40 md:backdrop-blur-sm"
            onClick={onClose}
          />

          {/* 模态框内容 */}
          <m.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative z-10 w-full h-full md:w-full md:max-w-[1100px] md:h-[680px] flex items-center max-h-none"
          >
            <div className="relative w-full h-full overflow-hidden rounded-none md:rounded-[2.5rem] bg-transparent md:bg-black/10 shadow-none md:shadow-2xl md:p-6 md:flex md:items-stretch">
              {/* 背景图片区域 - 铺满整个卡片 */}
              <div className="absolute inset-0 z-0 hidden md:block">
                <Image
                  src="/images/login-background.webp"
                  alt="Auth Background"
                  fill
                  className="object-cover"
                  priority
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-transparent" />
              </div>

              {/* 关闭按钮 */}
              <button
                onClick={onClose}
                className="hidden md:flex absolute right-6 top-6 z-50 h-9 w-9 items-center justify-center rounded-full bg-brand-charcoal/5 md:bg-white/40 text-brand-charcoal/40 backdrop-blur-md transition-all hover:bg-brand-charcoal/10 md:hover:bg-white/80 hover:text-brand-charcoal/70"
              >
                <X className="h-5 w-5" />
              </button>

              {/* 浮动表单区域 */}
              <div className="relative z-10 w-full md:w-[440px] flex flex-col items-stretch h-full justify-center">
                <div className="flex-1 flex flex-col justify-center md:justify-start rounded-none md:rounded-[2.5rem] bg-transparent md:bg-white/65 backdrop-blur-none md:backdrop-blur-xl shadow-none md:shadow-[0_8px_32px_0_rgba(0,0,0,0.1)] border-none md:border md:border-white/50 overflow-hidden">
                  {/* 顶部装饰 - 固定 */}
                  <div className="hidden md:block relative px-6 md:px-8 pb-3 pt-6 md:pb-5 md:pt-10 text-center shrink-0">
                    <div className="mx-auto mb-4 flex justify-center">
                      <Image
                        src="/images/NIHPLOD-logo.svg"
                        alt="NIHPLOD Logo"
                        width={120}
                        className="object-contain h-auto w-[120px]"
                        height={48}
                        priority
                      />
                    </div>
                    <h2 className="text-2xl font-semibold tracking-[0.05em] text-brand-charcoal">
                      注册会员
                    </h2>
                  </div>

                  {/* 手机端顶部栏 */}
                  <div className="md:hidden flex-shrink-0 h-[56px] w-full flex items-center relative">
                    <button
                      onClick={onClose}
                      className="absolute left-0 top-0 bottom-0 flex items-center justify-center px-4 py-[10px]"
                    >
                      <ChevronLeft className="h-6 w-6 text-[#00263E]" />
                    </button>
                  </div>

                  {/* 表单内容 - 可滚动 */}
                  <div className="flex-1 overflow-y-auto px-6 md:px-10 pt-6 pb-6 md:pb-4 scrollbar-hide flex flex-col justify-start">

                    {/* ===== 手机端极简全屏注册 ===== */}
                    <div className="md:hidden flex flex-col gap-8">
                      <div className="flex justify-center">
                        <Image
                          src="/images/NIHPLOD-logo.svg"
                          alt="NIHPLOD Logo"
                          width={140}
                          height={56}
                          className="object-contain h-auto w-[140px]"
                          priority
                        />
                      </div>
                      <form onSubmit={handleRegister} className="w-full space-y-6">
                        <div>
                          <input
                            type="tel"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            autoComplete="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                            placeholder="手机号"
                            className="w-full bg-transparent border-0 border-b border-brand-charcoal/25 rounded-none py-3 px-0 text-base tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/40 placeholder:text-sm placeholder:tracking-wider focus:outline-none focus:border-brand-gold/60 transition-colors"
                          />
                        </div>

                        <div className="relative flex gap-2">
                          <input
                            type="text"
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                            placeholder="验证码"
                            className="flex-1 bg-transparent border-0 border-b border-brand-charcoal/25 rounded-none py-3 px-0 text-base tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/40 placeholder:text-sm placeholder:tracking-wider focus:outline-none focus:border-brand-gold/60 transition-colors"
                          />
                          <button
                            type="button"
                            onClick={sendCode}
                            disabled={countdown > 0 || phone.length !== 11}
                            className="shrink-0 self-end mb-2 px-3 py-1 text-xs font-medium tracking-wider text-brand-charcoal/60 border border-brand-charcoal/25 disabled:opacity-30 transition-all"
                          >
                            {countdown > 0 ? `${countdown}s` : "获取验证码"}
                          </button>
                        </div>

                        <div>
                          <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="密码（至少6位）"
                            maxLength={32}
                            className="w-full bg-transparent border-0 border-b border-brand-charcoal/25 rounded-none py-3 px-0 text-base tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/40 placeholder:text-sm placeholder:tracking-wider focus:outline-none focus:border-brand-gold/60 transition-colors"
                          />
                        </div>

                        <div>
                          <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="确认密码"
                            maxLength={32}
                            className="w-full bg-transparent border-0 border-b border-brand-charcoal/25 rounded-none py-3 px-0 text-base tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/40 placeholder:text-sm placeholder:tracking-wider focus:outline-none focus:border-brand-gold/60 transition-colors"
                          />
                        </div>

                        <label className="flex cursor-pointer items-center gap-2.5 pt-2 group/agreement">
                          <div className="relative flex-shrink-0">
                            <input
                              type="checkbox"
                              checked={agreed}
                              onChange={(e) => setAgreed(e.target.checked)}
                              className="peer sr-only"
                            />
                            <div className="h-4 w-4 rounded border border-brand-charcoal/25 bg-transparent transition-all peer-checked:bg-brand-gold peer-checked:border-brand-gold" />
                            <Check className="absolute inset-0 m-auto h-3 w-3 scale-0 text-white transition-transform peer-checked:scale-100" strokeWidth={3} />
                          </div>
                          <span className="text-xs text-brand-charcoal/50 tracking-wide">
                            我已阅读并同意
                            <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline decoration-brand-charcoal/20 underline-offset-2 hover:text-brand-charcoal transition-colors">《用户协议》</a>
                            和
                            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline decoration-brand-charcoal/20 underline-offset-2 hover:text-brand-charcoal transition-colors">《隐私政策》</a>
                          </span>
                        </label>

                        <div className="pt-2">
                          <button
                            type="submit"
                            disabled={loading || !agreed}
                            className="w-full py-3.5 text-sm font-medium tracking-[0.2em] text-brand-charcoal border border-brand-charcoal/25 hover:bg-brand-charcoal/[0.03] active:scale-[0.98] transition-all disabled:opacity-40"
                          >
                            <span className="relative z-10 flex items-center justify-center gap-2">
                              {loading ? (
                                <div className="h-4 w-4 border-2 border-brand-charcoal/20 border-t-brand-charcoal rounded-full animate-spin" />
                              ) : "立即注册"}
                            </span>
                          </button>
                        </div>
                      </form>

                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={onSwitchToLogin}
                          className="inline-flex h-7 min-h-0 items-center justify-center text-xs text-brand-charcoal/40 tracking-wide hover:text-brand-charcoal/70 transition-colors"
                        >
                          已有账户？返回登录
                        </button>
                      </div>
                    </div>

                    {/* ===== PC端原有卡片布局 ===== */}
                    <div className="hidden md:block">
                      <form onSubmit={handleRegister} className="space-y-3">
                        {/* 手机号 */}
                        <div className="group">
                          <div className="relative">
                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                              <Smartphone className="h-4 w-4 text-brand-charcoal/50 transition-colors group-focus-within:text-brand-charcoal stroke-[2px]" />
                            </div>
                            <input
                              type="tel"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              autoComplete="tel"
                              value={phone}
                              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                              placeholder="手机号"
                              className="w-full bg-black/5 md:bg-white/20 border border-black/10 md:border-white/30 rounded-xl py-3.5 pl-11 pr-4 text-sm tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/50 focus:bg-black/10 md:focus:bg-white/40 focus:border-brand-gold/60 focus:outline-none transition-all"
                            />
                          </div>
                        </div>

                        {/* 验证码 */}
                        <div className="group">
                          <div className="relative flex gap-2">
                            <div className="relative flex-1">
                              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                                <Shield className="h-4 w-4 text-brand-charcoal/50 transition-colors group-focus-within:text-brand-charcoal stroke-[2px]" />
                              </div>
                              <input
                                type="text"
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                placeholder="验证码"
                                className="w-full bg-black/5 md:bg-white/20 border border-black/10 md:border-white/30 rounded-xl py-3.5 pl-11 pr-4 text-sm tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/50 focus:bg-black/10 md:focus:bg-white/40 focus:border-brand-gold/60 focus:outline-none transition-all"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={sendCode}
                              disabled={countdown > 0 || phone.length !== 11}
                              className="shrink-0 px-4 rounded-xl bg-black/5 md:bg-white/20 border border-black/10 md:border-white/30 text-[14px] font-semibold text-brand-gold transition-all hover:bg-black/10 md:hover:bg-white/40 disabled:opacity-30"
                            >
                              {countdown > 0 ? `${countdown}s` : "获取验证码"}
                            </button>
                          </div>
                        </div>

                        {/* 密码 */}
                        <div className="group">
                          <div className="relative">
                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                              <Lock className="h-4 w-4 text-brand-charcoal/50 transition-colors group-focus-within:text-brand-charcoal stroke-[2px]" />
                            </div>
                            <input
                              type="password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="密码（至少6位）"
                              maxLength={32}
                              className="w-full bg-black/5 md:bg-white/20 border border-black/10 md:border-white/30 rounded-xl py-3.5 pl-11 pr-4 text-sm tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/50 focus:bg-black/10 md:focus:bg-white/40 focus:border-brand-gold/60 focus:outline-none transition-all"
                            />
                          </div>
                        </div>

                        {/* 确认密码 */}
                        <div className="group">
                          <div className="relative">
                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                              <Lock className="h-4 w-4 text-brand-charcoal/50 transition-colors group-focus-within:text-brand-charcoal stroke-[2px]" />
                            </div>
                            <input
                              type="password"
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              placeholder="确认密码"
                              maxLength={32}
                              className="w-full bg-black/5 md:bg-white/20 border border-black/10 md:border-white/30 rounded-xl py-3.5 pl-11 pr-4 text-sm tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/50 focus:bg-black/10 md:focus:bg-white/40 focus:border-brand-gold/60 focus:outline-none transition-all"
                            />
                          </div>
                        </div>

                        {/* 协议勾选 */}
                        <label className="flex cursor-pointer items-start gap-3 group/agreement">
                          <div className="relative mt-0.5">
                            <input
                              type="checkbox"
                              checked={agreed}
                              onChange={(e) => setAgreed(e.target.checked)}
                              className="peer sr-only"
                            />
                            <div className="h-4 w-4 rounded border border-black/20 md:border-white/40 bg-black/5 md:bg-white/10 backdrop-blur-sm transition-all peer-checked:bg-brand-gold peer-checked:border-brand-gold" />
                            <Check className="absolute inset-0 h-4 w-4 scale-0 text-white transition-transform peer-checked:scale-75" strokeWidth={4} />
                          </div>
                          <span className="text-[12px] leading-relaxed text-brand-charcoal/60 select-none">
                            我已阅读并同意
                            <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-brand-charcoal/80 hover:text-brand-charcoal mx-0.5 underline decoration-brand-charcoal/20 underline-offset-4">《用户协议》</a>
                            和
                            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-brand-charcoal/80 hover:text-brand-charcoal mx-0.5 underline decoration-brand-charcoal/20 underline-offset-4">《隐私政策》</a>
                          </span>
                        </label>

                        {/* 注册按钮 */}
                        <button
                          type="submit"
                          disabled={loading || !agreed}
                          className="group relative w-full overflow-hidden rounded-xl bg-brand-gold py-4 text-sm font-bold uppercase tracking-[0.2em] text-white shadow-lg shadow-brand-gold/20 transition-all hover:bg-brand-gold-dark hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                        >
                          <span className="relative z-10 flex items-center justify-center gap-2">
                            {loading ? (
                              <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : "立即注册"}
                          </span>
                        </button>
                      </form>
                    </div>{/* 关闭 PC端 hidden md:block */}
                  </div>

                  {/* 手机端页脚 */}
                  <div className="md:hidden flex-shrink-0 pt-4 pb-4 text-center mx-6">
                    <p className="text-[10px] font-medium tracking-[0.12em] text-[rgba(123,114,108,0.3)] uppercase">
                      &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
                    </p>
                  </div>

                  {/* 底部导航 - 固定（PC端 only） */}
                  <div className="hidden md:block shrink-0 border-t border-black/5 md:border-white/20 bg-black/[0.02] md:bg-white/10 px-6 md:px-10 py-4 text-center">
                    <p className="text-xs text-brand-charcoal/60">
                      已有账户？
                      <button
                        type="button"
                        onClick={onSwitchToLogin}
                        className="ml-1 font-bold text-brand-gold hover:text-brand-gold-dark transition-all"
                      >
                        立即登录
                      </button>
                    </p>
                  </div>
                </div>
              </div>

              {/* 右侧品牌展示区域 - 桌面端 */}
              <div className="relative z-10 hidden md:flex flex-1 flex-col items-center justify-center">
                <div className="text-center space-y-6">
                  <div className="space-y-2">
                    <p className="text-[2.5rem] font-light tracking-[0.15em] text-brand-gold">
                      精简护肤
                    </p>
                    <p className="text-[2.5rem] font-light tracking-[0.15em] text-white/90">
                      减法美学
                    </p>
                  </div>
                  <div className="flex flex-col items-center gap-1 pt-4">
                    <Image
                      src="/images/NIHPLOD-logo.svg"
                      alt="NIHPLOD"
                      width={120}
                      height={30}
                      className="opacity-90 brightness-0 invert"
                    />
                  </div>
                </div>
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
  const { openContact: _openContact } = useAuth();
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

  const isMobile = useIsMobile();

  // 禁止背景滚动（移动端使用 fixed 定位防止 iOS 弹性滚动）
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      if (isMobile) {
        const scrollY = window.scrollY;
        document.body.style.position = "fixed";
        document.body.style.width = "100%";
        document.body.style.top = `-${scrollY}px`;
      }
    } else {
      document.body.style.overflow = "unset";
      if (isMobile) {
        const scrollY = document.body.style.top;
        document.body.style.position = "";
        document.body.style.width = "";
        document.body.style.top = "";
        if (scrollY) {
          window.scrollTo(0, parseInt(scrollY) * -1);
        }
      }
    }
    return () => {
      document.body.style.overflow = "unset";
      if (isMobile) {
        document.body.style.position = "";
        document.body.style.width = "";
        document.body.style.top = "";
      }
    };
  }, [isOpen, isMobile]);

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
        <div className="fixed inset-x-0 top-0 z-[9999] flex items-center justify-center h-[100dvh] p-4 md:pt-4 md:px-4 md:pb-4">
          {/* 背景遮罩 */}
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-[#F8F7F3] md:bg-black/40 md:backdrop-blur-sm"
            onClick={onClose}
          />

          {/* 模态框内容 */}
          <m.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative z-10 w-full h-full md:w-full md:max-w-[1100px] md:h-[680px] flex items-center max-h-none"
          >
            <div className="relative w-full h-full overflow-hidden rounded-none md:rounded-[2.5rem] bg-transparent md:bg-black/10 shadow-none md:shadow-2xl md:p-6 md:flex md:items-stretch">
              {/* 背景图片区域 - 铺满整个卡片 */}
              <div className="absolute inset-0 z-0 hidden md:block">
                <Image
                  src="/images/login-background.webp"
                  alt="Auth Background"
                  fill
                  className="object-cover"
                  priority
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-transparent" />
              </div>

              {/* 关闭按钮 */}
              <button
                onClick={onClose}
                className="hidden md:flex absolute right-6 top-6 z-50 h-9 w-9 items-center justify-center rounded-full bg-brand-charcoal/5 md:bg-white/40 text-brand-charcoal/40 backdrop-blur-md transition-all hover:bg-brand-charcoal/10 md:hover:bg-white/80 hover:text-brand-charcoal/70"
              >
                <X className="h-5 w-5" />
              </button>

              {/* 浮动表单区域 */}
              <div className="relative z-10 w-full md:w-[440px] flex flex-col items-stretch h-full justify-center">
                <div className="flex-1 flex flex-col justify-center md:justify-start rounded-none md:rounded-[2.5rem] bg-transparent md:bg-white/65 backdrop-blur-none md:backdrop-blur-xl shadow-none md:shadow-[0_8px_32px_0_rgba(0,0,0,0.1)] border-none md:border md:border-white/50 overflow-hidden">
                  {/* 顶部装饰 - 固定 */}
                  <div className="hidden md:block relative px-6 md:px-8 pb-3 pt-6 md:pb-5 md:pt-10 text-center shrink-0">
                    <div className="mx-auto mb-4 flex justify-center">
                      <Image
                        src="/images/NIHPLOD-logo.svg"
                        alt="NIHPLOD Logo"
                        width={120}
                        className="object-contain h-auto w-[120px]"
                        height={48}
                        priority
                      />
                    </div>
                    <h2 className="text-2xl font-semibold tracking-[0.05em] text-brand-charcoal">
                      找回密码
                    </h2>
                  </div>

                  {/* 手机端顶部栏 */}
                  <div className="md:hidden flex-shrink-0 h-[56px] w-full flex items-center relative">
                    <button
                      onClick={onClose}
                      className="absolute left-0 top-0 bottom-0 flex items-center justify-center px-4 py-[10px]"
                    >
                      <ChevronLeft className="h-6 w-6 text-[#00263E]" />
                    </button>
                  </div>

                  {/* 表单内容 - 可滚动 */}
                  <div className="flex-1 overflow-y-auto px-6 md:px-10 pt-6 pb-6 md:pb-4 scrollbar-hide flex flex-col justify-start">

                    {/* ===== 手机端极简全屏找回密码 ===== */}
                    <div className="md:hidden flex flex-col gap-8">
                      <div className="flex justify-center">
                        <Image
                          src="/images/NIHPLOD-logo.svg"
                          alt="NIHPLOD Logo"
                          width={140}
                          height={56}
                          className="object-contain h-auto w-[140px]"
                          priority
                        />
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

                      {step === "phone" && (
                        <div className="w-full space-y-6">
                          <div>
                            <input
                              type="tel"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              autoComplete="tel"
                              value={phone}
                              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                              placeholder="手机号"
                              className="w-full bg-transparent border-0 border-b border-brand-charcoal/25 rounded-none py-3 px-0 text-base tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/40 placeholder:text-sm placeholder:tracking-wider focus:outline-none focus:border-brand-gold/60 transition-colors"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={sendCode}
                            disabled={loading || phone.length !== 11}
                            className="w-full py-3.5 text-sm font-medium tracking-[0.2em] text-brand-charcoal border border-brand-charcoal/25 hover:bg-brand-charcoal/[0.03] active:scale-[0.98] transition-all disabled:opacity-40"
                          >
                            {loading ? "发送中..." : "找回密码"}
                          </button>
                          <div className="text-center">
                            <button
                              type="button"
                              onClick={onSwitchToLogin}
                              className="text-xs text-brand-charcoal/40 tracking-wide hover:text-brand-charcoal/70 transition-colors"
                            >
                              返回登录
                            </button>
                          </div>
                        </div>
                      )}

                      {step === "code" && (
                        <div className="w-full space-y-6">
                          <p className="text-center text-sm text-brand-charcoal/60">
                            验证码已发送至 {phone.slice(0, 3)}****{phone.slice(-4)}
                          </p>
                          <div className="relative flex gap-2">
                            <input
                              type="text"
                              value={code}
                              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                              placeholder="6位验证码"
                              className="flex-1 bg-transparent border-0 border-b border-brand-charcoal/25 rounded-none py-3 px-0 text-base tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/40 placeholder:text-sm placeholder:tracking-wider focus:outline-none focus:border-brand-gold/60 transition-colors"
                            />
                          </div>
                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={() => setStep("phone")}
                              className="flex-1 py-3 text-xs font-medium tracking-[0.2em] text-brand-charcoal/60 border border-brand-charcoal/25 hover:bg-brand-charcoal/[0.03] active:scale-[0.98] transition-all"
                            >
                              返回
                            </button>
                            <button
                              type="button"
                              onClick={verifyCode}
                              disabled={code.length !== 6}
                              className="flex-1 py-3 text-xs font-medium tracking-[0.2em] text-brand-charcoal border border-brand-charcoal/25 hover:bg-brand-charcoal/[0.03] active:scale-[0.98] transition-all disabled:opacity-40"
                            >
                              下一步
                            </button>
                          </div>
                          <p className="text-center text-xs text-brand-charcoal/50 font-medium">
                            {countdown > 0 ? (
                              `${countdown}秒后可重新发送`
                            ) : (
                              <button type="button" onClick={sendCode} className="text-brand-gold hover:underline">
                                重新发送验证码
                              </button>
                            )}
                          </p>
                        </div>
                      )}

                      {step === "password" && (
                        <div className="w-full space-y-6">
                          <div>
                            <input
                              type="password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="新密码（至少6位）"
                              maxLength={32}
                              className="w-full bg-transparent border-0 border-b border-brand-charcoal/25 rounded-none py-3 px-0 text-base tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/40 placeholder:text-sm placeholder:tracking-wider focus:outline-none focus:border-brand-gold/60 transition-colors"
                            />
                          </div>
                          <div>
                            <input
                              type="password"
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              placeholder="确认新密码"
                              maxLength={32}
                              className="w-full bg-transparent border-0 border-b border-brand-charcoal/25 rounded-none py-3 px-0 text-base tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/40 placeholder:text-sm placeholder:tracking-wider focus:outline-none focus:border-brand-gold/60 transition-colors"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={resetPassword}
                            disabled={loading || password.length < 6}
                            className="w-full py-3.5 text-sm font-medium tracking-[0.2em] text-brand-charcoal border border-brand-charcoal/25 hover:bg-brand-charcoal/[0.03] active:scale-[0.98] transition-all disabled:opacity-40"
                          >
                            <span className="relative z-10 flex items-center justify-center gap-2">
                              {loading ? (
                                <div className="h-4 w-4 border-2 border-brand-charcoal/20 border-t-brand-charcoal rounded-full animate-spin" />
                              ) : "确认重置"}
                            </span>
                          </button>
                        </div>
                      )}

                      {step === "success" && (
                        <div className="w-full space-y-6 text-center">
                          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                          </div>
                          <p className="text-xs tracking-widest text-brand-charcoal/40 uppercase">
                            Password Reset Successful
                          </p>
                          <button
                            type="button"
                            onClick={onSwitchToLogin}
                            className="w-full py-3.5 text-sm font-medium tracking-[0.2em] text-brand-charcoal border border-brand-charcoal/25 hover:bg-brand-charcoal/[0.03] active:scale-[0.98] transition-all"
                          >
                            返回登录
                          </button>
                        </div>
                      )}

                    </div>

                    {/* ===== PC端原有卡片布局 ===== */}
                    <div className="hidden md:block">
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
                        <div className="space-y-3">
                          <div className="group relative">
                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                              <Smartphone className="h-4 w-4 text-brand-charcoal/50 transition-colors group-focus-within:text-brand-charcoal stroke-[2px]" />
                            </div>
                            <input
                              type="tel"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              autoComplete="tel"
                              value={phone}
                              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                              placeholder="手机号"
                              className="w-full bg-black/5 md:bg-white/20 border border-black/10 md:border-white/30 rounded-xl py-3.5 pl-11 pr-4 text-sm tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/50 focus:bg-black/10 md:focus:bg-white/40 focus:border-brand-gold/60 focus:outline-none transition-all"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={sendCode}
                            disabled={loading || phone.length !== 11}
                            className="group relative w-full overflow-hidden rounded-xl bg-brand-gold py-4 text-sm font-bold uppercase tracking-[0.2em] text-white shadow-lg shadow-brand-gold/20 transition-all hover:bg-brand-gold-dark hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                          >
                            {loading ? "发送中..." : "找回密码"}
                          </button>

                          <div className="pt-4 text-center">
                            <button
                              type="button"
                              onClick={onSwitchToLogin}
                              className="text-xs text-brand-charcoal/50 hover:text-brand-charcoal/80 transition-colors"
                            >
                              返回登录
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 步骤 2: 输入验证码 */}
                      {step === "code" && (
                        <div className="space-y-3">
                          <p className="text-center text-sm text-brand-charcoal/60">
                            验证码已发送至 {phone.slice(0, 3)}****{phone.slice(-4)}
                          </p>
                          <div className="group relative">
                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                              <Shield className="h-4 w-4 text-brand-charcoal/50 transition-colors group-focus-within:text-brand-charcoal stroke-[2px]" />
                            </div>
                            <input
                              type="text"
                              value={code}
                              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                              placeholder="6位验证码"
                              className="w-full bg-black/5 md:bg-white/20 border border-black/10 md:border-white/30 rounded-xl py-3.5 pl-11 pr-4 text-sm tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/50 focus:bg-black/10 md:focus:bg-white/40 focus:border-brand-gold/60 focus:outline-none transition-all"
                            />
                          </div>
                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={() => setStep("phone")}
                              className="flex-1 rounded-xl bg-black/5 md:bg-white/10 border border-black/10 md:border-white/20 py-3 text-xs font-bold uppercase tracking-widest text-brand-charcoal/60 hover:bg-black/10 md:hover:bg-white/20 transition-all"
                            >
                              返回
                            </button>
                            <button
                              type="button"
                              onClick={verifyCode}
                              disabled={code.length !== 6}
                              className="flex-1 overflow-hidden rounded-xl bg-brand-gold py-4 text-xs font-bold uppercase tracking-widest text-white shadow-lg shadow-brand-gold/20 transition-all hover:bg-brand-gold-dark active:scale-[0.98] disabled:opacity-50"
                            >
                              下一步
                            </button>
                          </div>
                          <p className="text-center text-xs text-brand-charcoal/50 font-medium">
                            {countdown > 0 ? (
                              `${countdown}秒后可重新发送`
                            ) : (
                              <button type="button" onClick={sendCode} className="text-brand-gold hover:underline">
                                重新发送验证码
                              </button>
                            )}
                          </p>
                        </div>
                      )}

                      {/* 步骤 3: 设置新密码 */}
                      {step === "password" && (
                        <div className="space-y-3">
                          <div className="group relative">
                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                              <Lock className="h-4 w-4 text-brand-charcoal/50 transition-colors group-focus-within:text-brand-charcoal stroke-[2px]" />
                            </div>
                            <input
                              type="password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="新密码（至少6位）"
                              maxLength={32}
                              className="w-full bg-black/5 md:bg-white/20 border border-black/10 md:border-white/30 rounded-xl py-3.5 pl-11 pr-4 text-sm tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/50 focus:bg-black/10 md:focus:bg-white/40 focus:border-brand-gold/60 focus:outline-none transition-all"
                            />
                          </div>
                          <div className="group relative">
                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                              <Lock className="h-4 w-4 text-brand-charcoal/50 transition-colors group-focus-within:text-brand-charcoal stroke-[2px]" />
                            </div>
                            <input
                              type="password"
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              placeholder="确认新密码"
                              maxLength={32}
                              className="w-full bg-black/5 md:bg-white/20 border border-black/10 md:border-white/30 rounded-xl py-3.5 pl-11 pr-4 text-sm tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/50 focus:bg-black/10 md:focus:bg-white/40 focus:border-brand-gold/60 focus:outline-none transition-all"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={resetPassword}
                            disabled={loading || password.length < 6}
                            className="group relative w-full overflow-hidden rounded-xl bg-brand-gold py-4 text-sm font-bold uppercase tracking-[0.2em] text-white shadow-lg shadow-brand-gold/20 transition-all hover:bg-brand-gold-dark hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                          >
                            <span className="relative z-10 flex items-center justify-center gap-2">
                              {loading ? (
                                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              ) : "确认重置"}
                            </span>
                          </button>
                        </div>
                      )}

                      {/* 步骤 4: 成功 */}
                      {step === "success" && (
                        <div className="space-y-3 text-center">
                          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                          </div>
                          <p className="text-xs tracking-widest text-brand-charcoal/40 uppercase">
                            Password Reset Successful
                          </p>
                          <button
                            type="button"
                            onClick={onSwitchToLogin}
                            className="group relative w-full overflow-hidden rounded-xl bg-brand-gold py-4 text-sm font-bold uppercase tracking-[0.2em] text-white shadow-lg shadow-brand-gold/20 transition-all hover:bg-brand-gold-dark hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                          >
                            返回登录
                          </button>
                        </div>
                      )}
                    </div>{/* 关闭 PC端 hidden md:block */}
                  </div>

                  {/* 手机端页脚 */}
                  <div className="md:hidden flex-shrink-0 pt-4 pb-4 text-center mx-6">
                    <p className="text-[10px] font-medium tracking-[0.12em] text-[rgba(123,114,108,0.3)] uppercase">
                      &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
                    </p>
                  </div>

                  {/* 底部导航 - 固定（PC端 only） */}
                  {step === "success" && (
                    <div className="hidden md:block shrink-0 border-t border-black/5 md:border-white/20 bg-black/[0.02] md:bg-white/10 px-6 md:px-10 py-4 text-center">
                      <p className="text-xs text-brand-charcoal/60">
                        密码已重置，请使用新密码登录
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* 右侧品牌展示区域 - 桌面端 */}
              <div className="relative z-10 hidden md:flex flex-1 flex-col items-center justify-center">
                <div className="text-center space-y-6">
                  <div className="space-y-2">
                    <p className="text-[2.5rem] font-light tracking-[0.15em] text-brand-gold">
                      精简护肤
                    </p>
                    <p className="text-[2.5rem] font-light tracking-[0.15em] text-white/90">
                      减法美学
                    </p>
                  </div>
                  <div className="flex flex-col items-center gap-1 pt-4">
                    <Image
                      src="/images/NIHPLOD-logo.svg"
                      alt="NIHPLOD"
                      width={120}
                      height={30}
                      className="opacity-90 brightness-0 invert"
                    />
                  </div>
                </div>
              </div>
            </div>
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/**
 * 微信绑定模态框
 */
function WechatBindModal({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
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

  const isMobile = useIsMobile();

  // 禁止背景滚动（移动端使用 fixed 定位防止 iOS 弹性滚动）
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      if (isMobile) {
        const scrollY = window.scrollY;
        document.body.style.position = "fixed";
        document.body.style.width = "100%";
        document.body.style.top = `-${scrollY}px`;
      }
    } else {
      document.body.style.overflow = "unset";
      if (isMobile) {
        const scrollY = document.body.style.top;
        document.body.style.position = "";
        document.body.style.width = "";
        document.body.style.top = "";
        if (scrollY) {
          window.scrollTo(0, parseInt(scrollY) * -1);
        }
      }
    }
    return () => {
      document.body.style.overflow = "unset";
      if (isMobile) {
        document.body.style.position = "";
        document.body.style.width = "";
        document.body.style.top = "";
      }
    };
  }, [isOpen, isMobile]);

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
        body: JSON.stringify({ phone, type: "register" }), // use register type for bind verification
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

  // 绑定
  const handleBind = async (e: React.FormEvent) => {
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
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/auth/wechat/bind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code, password }),
      });
      const data = await res.json();
      if (!data.success) {
        setErrorMsg(data.error?.message || "绑定失败");
        return;
      }
      await onSuccess();
      // clean window location to remove ?login=wechat_bind
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
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
        <div className="fixed inset-x-0 top-0 z-[9999] flex items-center justify-center h-[100dvh] p-4 md:pt-4 md:px-4 md:pb-4">
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-[#F8F7F3] md:bg-black/40 md:backdrop-blur-sm"
            onClick={onClose}
          />
          <m.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative z-10 w-full h-full md:w-full md:max-w-[1100px] md:h-[680px] flex items-center max-h-none"
          >
            <div className="relative w-full h-full overflow-hidden rounded-none md:rounded-[2.5rem] bg-transparent md:bg-black/10 shadow-none md:shadow-2xl md:p-6 md:flex md:items-stretch">
              <div className="absolute inset-0 z-0 hidden md:block">
                <Image
                  src="/images/login-background.webp"
                  alt="Auth Background"
                  fill
                  className="object-cover"
                  priority
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-transparent" />
              </div>
              <button
                onClick={onClose}
                className="hidden md:flex absolute right-6 top-6 z-50 h-9 w-9 items-center justify-center rounded-full bg-brand-charcoal/5 md:bg-white/40 text-brand-charcoal/40 backdrop-blur-md transition-all hover:bg-brand-charcoal/10 md:hover:bg-white/80 hover:text-brand-charcoal/70"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="relative z-10 w-full md:w-[440px] flex flex-col items-stretch h-full justify-center">
                <div className="flex-1 flex flex-col justify-center md:justify-start rounded-none md:rounded-[2.5rem] bg-transparent md:bg-white/65 backdrop-blur-none md:backdrop-blur-xl shadow-none md:shadow-[0_8px_32px_0_rgba(0,0,0,0.1)] border-none md:border md:border-white/50 overflow-hidden">
                  {/* 顶部装饰 - 固定（PC端） */}
                  <div className="hidden md:block relative px-6 md:px-8 pb-3 pt-6 md:pb-5 md:pt-10 text-center shrink-0">
                    <div className="mx-auto mb-4 flex justify-center">
                      <Image
                        src="/images/NIHPLOD-logo.svg"
                        alt="NIHPLOD Logo"
                        width={120}
                        className="object-contain h-auto w-[120px]"
                        height={48}
                        priority
                      />
                    </div>
                    <h2 className="text-2xl font-semibold tracking-[0.05em] text-brand-charcoal">
                      绑定手机号
                    </h2>
                  </div>

                  {/* 手机端顶部栏 */}
                  <div className="md:hidden flex-shrink-0 h-[56px] w-full flex items-center relative">
                    <button
                      onClick={onClose}
                      className="absolute left-0 top-0 bottom-0 flex items-center justify-center px-4 py-[10px]"
                    >
                      <ChevronLeft className="h-6 w-6 text-[#00263E]" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto px-6 md:px-10 pt-6 pb-6 md:pb-4 scrollbar-hide flex flex-col justify-start">
                    <div className="md:hidden flex justify-center mb-10">
                      <Image
                        src="/images/NIHPLOD-logo.svg"
                        alt="NIHPLOD Logo"
                        width={140}
                        height={56}
                        className="object-contain h-auto w-[140px]"
                        priority
                      />
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

                    <form onSubmit={handleBind} className="space-y-3">
                      <p className="text-center text-brand-charcoal/60 text-xs mb-4">
                        为了保障您的账户安全与多端同步体验，请绑定并在日后使用此手机号登录。
                      </p>
                      {/* 手机号 */}
                      <div className="group">
                        <div className="relative">
                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                            <Smartphone className="h-4 w-4 text-brand-charcoal/50 transition-colors group-focus-within:text-brand-charcoal stroke-[2px]" />
                          </div>
                          <input
                            type="tel"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            autoComplete="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                            placeholder="请输入绑定的真实手机号"
                            className="w-full bg-black/5 md:bg-white/20 border border-black/10 md:border-white/30 rounded-xl py-3.5 pl-11 pr-4 text-sm tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/50 focus:bg-black/10 md:focus:bg-white/40 focus:border-brand-gold/60 focus:outline-none transition-all"
                          />
                        </div>
                      </div>

                      {/* 验证码 */}
                      <div className="group">
                        <div className="relative flex gap-2">
                          <div className="relative flex-1">
                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                              <Shield className="h-4 w-4 text-brand-charcoal/50 transition-colors group-focus-within:text-brand-charcoal stroke-[2px]" />
                            </div>
                            <input
                              type="text"
                              value={code}
                              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                              placeholder="6位验证码"
                              className="w-full bg-black/5 md:bg-white/20 border border-black/10 md:border-white/30 rounded-xl py-3.5 pl-11 pr-4 text-sm tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/50 focus:bg-black/10 md:focus:bg-white/40 focus:border-brand-gold/60 focus:outline-none transition-all"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={sendCode}
                            disabled={countdown > 0 || phone.length !== 11}
                            className="shrink-0 px-4 rounded-xl bg-black/5 md:bg-white/20 border border-black/10 md:border-white/30 text-[14px] font-semibold text-brand-gold transition-all hover:bg-black/10 md:hover:bg-white/40 disabled:opacity-30"
                          >
                            {countdown > 0 ? `${countdown}s` : "获取验证码"}
                          </button>
                        </div>
                      </div>

                      {/* 密码 */}
                      <div className="group">
                        <div className="relative">
                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                            <Lock className="h-4 w-4 text-brand-charcoal/50 transition-colors group-focus-within:text-brand-charcoal stroke-[2px]" />
                          </div>
                          <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="设置密码（至少6位）"
                            maxLength={32}
                            className="w-full bg-black/5 md:bg-white/20 border border-black/10 md:border-white/30 rounded-xl py-3.5 pl-11 pr-4 text-sm tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/50 focus:bg-black/10 md:focus:bg-white/40 focus:border-brand-gold/60 focus:outline-none transition-all"
                          />
                        </div>
                      </div>

                      {/* 协议勾选 */}
                      <label className="flex cursor-pointer items-start gap-3 group/agreement">
                        <div className="relative mt-0.5">
                          <input
                            type="checkbox"
                            checked={agreed}
                            onChange={(e) => setAgreed(e.target.checked)}
                            className="peer sr-only"
                          />
                          <div className="h-4 w-4 rounded border border-black/20 md:border-white/40 bg-black/5 md:bg-white/10 backdrop-blur-sm transition-all peer-checked:bg-brand-gold peer-checked:border-brand-gold" />
                          <Check className="absolute inset-0 h-4 w-4 scale-0 text-white transition-transform peer-checked:scale-75" strokeWidth={4} />
                        </div>
                        <span className="text-[12px] leading-relaxed text-brand-charcoal/60 select-none">
                          我已阅读并同意
                          <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-brand-charcoal/80 hover:text-brand-charcoal mx-0.5 underline decoration-brand-charcoal/20 underline-offset-4">《用户协议》</a>
                          和
                          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-brand-charcoal/80 hover:text-brand-charcoal mx-0.5 underline decoration-brand-charcoal/20 underline-offset-4">《隐私政策》</a>
                        </span>
                      </label>

                      {/* 绑定按钮 */}
                      <button
                        type="submit"
                        disabled={loading || !agreed}
                        className="group relative w-full overflow-hidden rounded-xl bg-brand-gold py-4 text-sm font-bold uppercase tracking-[0.2em] text-white shadow-lg shadow-brand-gold/20 transition-all hover:bg-brand-gold-dark hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                      >
                        <span className="relative z-10 flex items-center justify-center gap-2">
                          {loading ? (
                            <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : "绑定手机号并使用"}
                        </span>
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );
}
