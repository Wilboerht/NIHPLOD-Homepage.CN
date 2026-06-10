"use client";

/**
 * 登录/注册模态框组件 - 优雅品牌风格
 */
import { useState, useEffect } from "react";
import Image from "next/image";
import { X, Smartphone, Shield, Lock, KeyRound, CheckCircle2, Check, Headset, ChevronLeft, ArrowLeftRight } from "lucide-react";
import { Link } from "next-view-transitions";
import { m, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { useIsMobile } from "@/hooks/useMediaQuery";

// 登录方式类型
type LoginMethod = "code" | "password";

// 忘记密码步骤类型
type ForgotPasswordStep = "form" | "success";

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
            animate={{ opacity: 1, transition: { duration: 0.3 } }}
            exit={{ opacity: 0, transition: { duration: isMobile ? 0.8 : 0.3 } }}
            className="absolute inset-0 bg-[#F8F7F3] md:bg-black/40"
            onClick={onClose}
          />

          {/* 模态框内容 */}
          <m.div
            initial={isMobile ? { x: "100vw" } : { opacity: 0, scale: 0.95, y: 10 }}
            animate={isMobile ? { x: 0, transition: { duration: 0.8, ease: [0.8, 0, 0.13, 1] } } : { opacity: 1, scale: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } }}
            exit={isMobile ? { x: "100vw", transition: { duration: 0.8, ease: [0.9, 0, 0.17, 1] } } : { opacity: 0, scale: 0.95, y: 10, transition: { duration: 0.25, ease: "easeOut" } }}
            className="relative z-10 w-full h-full md:w-full md:max-w-[1100px] md:h-[680px] flex items-center max-h-none"
          >
            <div className="relative w-full h-full overflow-hidden rounded-none md:rounded-[2.5rem] bg-[#F8F7F3] md:bg-black/10 shadow-none md:shadow-2xl md:p-6 md:flex md:items-stretch">
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
                    <div className="md:hidden flex flex-col gap-14">
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

                        {/* 验证码输入 - 仅验证码登录时显示 */}
                        {loginMethod === "code" && (
                          <div className="relative flex gap-2 animate-fade-scale-in">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={code}
                              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                              placeholder="验证码"
                              className="flex-1 bg-transparent border-0 border-b border-brand-charcoal/25 rounded-none py-3 px-0 text-base tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/40 placeholder:text-sm placeholder:tracking-wider focus:outline-none focus:border-brand-gold/60 transition-colors"
                            />
                            <div className="flex flex-col gap-1">
                              <button
                                type="button"
                                onClick={sendCode}
                                disabled={countdown > 0 || phone.length !== 11}
                                className="inline-flex h-12 min-h-0 items-center justify-center px-4 text-xs font-medium tracking-wider text-brand-charcoal/60 border border-brand-charcoal/25 disabled:opacity-30 transition-all"
                              >
                                {countdown > 0 ? `${countdown}s` : "获取验证码"}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* 密码输入 - 仅密码登录时显示 */}
                        {loginMethod === "password" && (
                          <div className="animate-fade-scale-in">
                            <input
                              type="password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="密码"
                              maxLength={32}
                              className="w-full bg-transparent border-0 border-b border-brand-charcoal/25 rounded-none py-3 px-0 text-base tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/40 placeholder:text-sm placeholder:tracking-wider focus:outline-none focus:border-brand-gold/60 transition-colors"
                            />
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => { setLoginMethod(loginMethod === "password" ? "code" : "password"); }}
                            className={`inline-flex h-7 min-h-0 items-center gap-1.5 text-xs tracking-wider transition-colors ${loginMethod === "code"
                              ? "text-brand-charcoal"
                              : "text-brand-charcoal/50 hover:text-brand-charcoal"
                              }`}
                          >
                            <ArrowLeftRight className="h-3 w-3" strokeWidth={2} />
                            {loginMethod === "password" ? "验证码登录" : "密码登录"}
                          </button>
                          {loginMethod === "password" && (
                            <button
                              type="button"
                              onClick={onSwitchToForgotPassword}
                              className="inline-flex h-7 min-h-0 items-center text-xs tracking-wider text-brand-charcoal/50 hover:text-brand-charcoal transition-colors"
                            >
                              找回密码
                            </button>
                          )}
                        </div>

                        <label className="flex cursor-pointer items-center gap-2.5 group/agreement">
                          <div className="relative flex-shrink-0">
                            <input
                              type="checkbox"
                              checked={agreed}
                              onChange={(e) => setAgreed(e.target.checked)}
                              className="peer sr-only"
                            />
                            <div className="h-4 w-4 rounded border border-brand-charcoal/25 bg-transparent transition-all peer-checked:bg-[#00263e]/50 peer-checked:border-[#00263e]/50" />
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
                      {/* 仅支持密码登录 */}
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

                      {/* 第三方登录已移除 */}
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
  const [showPasswordHint, setShowPasswordHint] = useState(false);
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
      setShowPasswordHint(false);
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
    if (password.length < 8) {
      toast.error("密码至少8位");
      return;
    }
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasDigit = /\d/.test(password);
    if (!hasUpper || !hasLower || !hasDigit) {
      toast.error("密码必须包含大写字母、小写字母、数字");
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
            animate={{ opacity: 1, transition: { duration: 0.3 } }}
            exit={{ opacity: 0, transition: { duration: isMobile ? 0.8 : 0.3 } }}
            className="absolute inset-0 bg-[#F8F7F3] md:bg-black/40"
            onClick={onClose}
          />

          {/* 模态框内容 */}
          <m.div
            initial={isMobile ? { x: "100vw" } : { opacity: 0, scale: 0.95, y: 10 }}
            animate={isMobile ? { x: 0, transition: { duration: 0.8, ease: [0.8, 0, 0.13, 1] } } : { opacity: 1, scale: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } }}
            exit={isMobile ? { x: "100vw", transition: { duration: 0.8, ease: [0.9, 0, 0.17, 1] } } : { opacity: 0, scale: 0.95, y: 10, transition: { duration: 0.25, ease: "easeOut" } }}
            className="relative z-10 w-full h-full md:w-full md:max-w-[1100px] md:h-[680px] flex items-center max-h-none"
          >
            <div className="relative w-full h-full overflow-hidden rounded-none md:rounded-[2.5rem] bg-[#F8F7F3] md:bg-black/10 shadow-none md:shadow-2xl md:p-6 md:flex md:items-stretch">
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
                    <div className="md:hidden flex flex-col gap-10">
                      {/* 标题区域 */}
                      <div className="text-center pt-[6px] pb-4">
                        <h2 className="text-[24px] font-medium tracking-[0.2em] text-[#00263E]">注册会员</h2>
                        <div className="mx-auto mt-2 w-[70px] border-b-[1.5px] border-[#00263E]" />
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
                            onChange={(e) => {
                              const val = e.target.value;
                              setPassword(val);
                              if (val.length > 0) {
                                const hasUpper = /[A-Z]/.test(val);
                                const hasLower = /[a-z]/.test(val);
                                const hasDigit = /\d/.test(val);
                                setShowPasswordHint(val.length < 8 || !hasUpper || !hasLower || !hasDigit);
                              } else {
                                setShowPasswordHint(false);
                              }
                            }}
                            placeholder="密码（至少8位）"
                            maxLength={32}
                            className="w-full bg-transparent border-0 border-b border-brand-charcoal/25 rounded-none py-3 px-0 text-base tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/40 placeholder:text-sm placeholder:tracking-wider focus:outline-none focus:border-brand-gold/60 transition-colors"
                          />
                          {showPasswordHint && (
                            <p className="mt-1.5 text-xs text-red-500">
                              *密码必须包含大写字母、小写字母、数字
                            </p>
                          )}
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
                              onChange={(e) => {
                                const val = e.target.value;
                                setPassword(val);
                                if (val.length > 0) {
                                  const hasUpper = /[A-Z]/.test(val);
                                  const hasLower = /[a-z]/.test(val);
                                  const hasDigit = /\d/.test(val);
                                  setShowPasswordHint(val.length < 8 || !hasUpper || !hasLower || !hasDigit);
                                } else {
                                  setShowPasswordHint(false);
                                }
                              }}
                              placeholder="密码（至少8位）"
                              maxLength={32}
                              className="w-full bg-black/5 md:bg-white/20 border border-black/10 md:border-white/30 rounded-xl py-3.5 pl-11 pr-4 text-sm tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/50 focus:bg-black/10 md:focus:bg-white/40 focus:border-brand-gold/60 focus:outline-none transition-all"
                            />
                          </div>
                          {showPasswordHint && (
                            <p className="mt-1.5 text-xs text-red-500 pl-1">
                              *密码必须包含大写字母、小写字母、数字
                            </p>
                          )}
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
  const [step, setStep] = useState<ForgotPasswordStep>("form");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showPasswordHint, setShowPasswordHint] = useState(false);

  // 关闭时重置表单
  useEffect(() => {
    if (!isOpen) {
      setStep("form");
      setPhone("");
      setCode("");
      setPassword("");
      setConfirmPassword("");
      setErrorMsg("");
      setShowPasswordHint(false);
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
      setStep("form");
    } catch {
      setErrorMsg("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  // 验证验证码并重置密码
  const verifyAndReset = async () => {
    if (!/^\d{6}$/.test(code)) {
      setErrorMsg("请输入6位验证码");
      return;
    }
    if (password.length < 8) {
      setErrorMsg("密码至少8位");
      return;
    }
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasDigit = /\d/.test(password);
    if (!hasUpper || !hasLower || !hasDigit) {
      setErrorMsg("密码必须包含大写字母、小写字母、数字");
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
            animate={{ opacity: 1, transition: { duration: 0.3 } }}
            exit={{ opacity: 0, transition: { duration: isMobile ? 0.8 : 0.3 } }}
            className="absolute inset-0 bg-[#F8F7F3] md:bg-black/40"
            onClick={onClose}
          />

          {/* 模态框内容 */}
          <m.div
            initial={isMobile ? { x: "100vw" } : { opacity: 0, scale: 0.95, y: 10 }}
            animate={isMobile ? { x: 0, transition: { duration: 0.8, ease: [0.8, 0, 0.13, 1] } } : { opacity: 1, scale: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } }}
            exit={isMobile ? { x: "100vw", transition: { duration: 0.8, ease: [0.9, 0, 0.17, 1] } } : { opacity: 0, scale: 0.95, y: 10, transition: { duration: 0.25, ease: "easeOut" } }}
            className="relative z-10 w-full h-full md:w-full md:max-w-[1100px] md:h-[680px] flex items-center max-h-none"
          >
            <div className="relative w-full h-full overflow-hidden rounded-none md:rounded-[2.5rem] bg-[#F8F7F3] md:bg-black/10 shadow-none md:shadow-2xl md:p-6 md:flex md:items-stretch">
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
                  <div className="md:hidden flex-shrink-0 h-[56px] w-full flex items-center justify-center relative">
                    <button
                      onClick={onSwitchToLogin}
                      className="absolute left-0 top-0 bottom-0 flex items-center justify-center px-4 py-[10px]"
                    >
                      <ChevronLeft className="h-6 w-6 text-[#00263E]" />
                    </button>
                    <Link href="/" className="flex items-center justify-center">
                      <div className="relative h-[28px] w-[100px]">
                        <Image
                          src="/images/NIHPLOD-logo.svg"
                          alt="NIHPLOD Logo"
                          fill
                          className="object-contain"
                          priority
                        />
                      </div>
                    </Link>
                  </div>

                  {/* 表单内容 - 可滚动 */}
                  <div className="flex-1 overflow-y-auto px-6 md:px-10 pt-6 pb-6 md:pb-4 scrollbar-hide flex flex-col justify-center">

                    {/* ===== 手机端极简全屏找回密码 ===== */}
                    <div className="md:hidden flex flex-col gap-10">
                      {/* 标题区域 */}
                      <div className="text-center">
                        <h2 className="text-[24px] font-medium tracking-[0.2em] text-[#00263E]">找回密码</h2>
                        <div className="mx-auto mt-2 w-[70px] border-b-[1.5px] border-[#00263E]" />
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

                      {step === "form" && (
                        <>
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
                            <div className="relative flex gap-2">
                              <input
                                type="text"
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                placeholder="验证码"
                                className="flex-1 bg-transparent border-0 border-b border-brand-charcoal/25 rounded-none py-3 px-0 text-base tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/40 placeholder:text-sm placeholder:tracking-wider focus:outline-none focus:border-brand-gold/60 transition-colors"
                              />
                              <div className="flex flex-col gap-1">
                                <button
                                  type="button"
                                  onClick={sendCode}
                                  disabled={countdown > 0 || phone.length !== 11}
                                  className="inline-flex h-12 min-h-0 items-center justify-center px-4 text-xs font-medium tracking-wider text-brand-charcoal/60 border border-brand-charcoal/25 disabled:opacity-30 transition-all"
                                >
                                  {countdown > 0 ? `${countdown}s` : "获取验证码"}
                                </button>
                              </div>
                            </div>
                            <div>
                              <input
                                type="password"
                                value={password}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setPassword(val);
                                  if (val.length > 0) {
                                    const hasUpper = /[A-Z]/.test(val);
                                    const hasLower = /[a-z]/.test(val);
                                    const hasDigit = /\d/.test(val);
                                    setShowPasswordHint(val.length < 8 || !hasUpper || !hasLower || !hasDigit);
                                  } else {
                                    setShowPasswordHint(false);
                                  }
                                }}
                                placeholder="新密码（至少8位）"
                                maxLength={32}
                                className="w-full bg-transparent border-0 border-b border-brand-charcoal/25 rounded-none py-3 px-0 text-base tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/40 placeholder:text-sm placeholder:tracking-wider focus:outline-none focus:border-brand-gold/60 transition-colors"
                              />
                              {showPasswordHint && (
                                <p className="mt-1.5 text-xs text-red-500">
                                  *密码必须包含大写字母、小写字母、数字
                                </p>
                              )}
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
                              onClick={verifyAndReset}
                              disabled={loading || phone.length !== 11 || code.length !== 6 || password.length < 8}
                              className="w-full py-3.5 text-sm font-medium tracking-[0.2em] text-brand-charcoal border border-brand-charcoal/25 hover:bg-brand-charcoal/[0.03] active:scale-[0.98] transition-all disabled:opacity-40"
                            >
                              <span className="relative z-10 flex items-center justify-center gap-2">
                                {loading ? (
                                  <div className="h-4 w-4 border-2 border-brand-charcoal/20 border-t-brand-charcoal rounded-full animate-spin" />
                                ) : "确认重置"}
                              </span>
                            </button>
                          </div>
                          <div className="flex flex-col gap-1">
                            <button
                              type="button"
                              onClick={() => { _openContact(); }}
                              className="inline-flex h-7 min-h-0 items-center justify-center text-xs text-brand-charcoal/40 tracking-wide hover:text-brand-charcoal/70 transition-colors underline underline-offset-4"
                            >
                              手机号无法使用？
                            </button>
                          </div>
                        </>
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
                      {step === "form" && (
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
                          <div className="group relative flex gap-2">
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
                          <div className="group relative">
                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                              <Lock className="h-4 w-4 text-brand-charcoal/50 transition-colors group-focus-within:text-brand-charcoal stroke-[2px]" />
                            </div>
                            <input
                              type="password"
                              value={password}
                              onChange={(e) => {
                                const val = e.target.value;
                                setPassword(val);
                                if (val.length > 0) {
                                  const hasUpper = /[A-Z]/.test(val);
                                  const hasLower = /[a-z]/.test(val);
                                  const hasDigit = /\d/.test(val);
                                  setShowPasswordHint(val.length < 8 || !hasUpper || !hasLower || !hasDigit);
                                } else {
                                  setShowPasswordHint(false);
                                }
                              }}
                              placeholder="新密码（至少8位）"
                              maxLength={32}
                              className="w-full bg-black/5 md:bg-white/20 border border-black/10 md:border-white/30 rounded-xl py-3.5 pl-11 pr-4 text-sm tracking-wide text-brand-charcoal placeholder:text-brand-charcoal/50 focus:bg-black/10 md:focus:bg-white/40 focus:border-brand-gold/60 focus:outline-none transition-all"
                            />
                            {showPasswordHint && (
                              <p className="mt-1.5 text-xs text-red-500 pl-1">
                                *密码必须包含大写字母、小写字母、数字
                              </p>
                            )}
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
                            onClick={verifyAndReset}
                            disabled={loading || phone.length !== 11 || code.length !== 6 || password.length < 8}
                            className="group relative w-full overflow-hidden rounded-xl bg-brand-gold py-4 text-sm font-bold uppercase tracking-[0.2em] text-white shadow-lg shadow-brand-gold/20 transition-all hover:bg-brand-gold-dark hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                          >
                            <span className="relative z-10 flex items-center justify-center gap-2">
                              {loading ? (
                                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              ) : "确认重置"}
                            </span>
                          </button>
                          <div className="pt-2 text-center">
                            <button
                              type="button"
                              onClick={() => { _openContact(); }}
                              className="text-xs text-brand-charcoal/50 hover:text-brand-charcoal/80 transition-colors underline underline-offset-4"
                            >
                              手机号无法使用？
                            </button>
                          </div>
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
            animate={{ opacity: 1, transition: { duration: 0.3 } }}
            exit={{ opacity: 0, transition: { duration: isMobile ? 0.8 : 0.3 } }}
            className="absolute inset-0 bg-[#F8F7F3] md:bg-black/40"
            onClick={onClose}
          />
          <m.div
            initial={isMobile ? { x: "100vw" } : { opacity: 0, scale: 0.95, y: 10 }}
            animate={isMobile ? { x: 0, transition: { duration: 0.8, ease: [0.8, 0, 0.13, 1] } } : { opacity: 1, scale: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } }}
            exit={isMobile ? { x: "100vw", transition: { duration: 0.8, ease: [0.9, 0, 0.17, 1] } } : { opacity: 0, scale: 0.95, y: 10, transition: { duration: 0.25, ease: "easeOut" } }}
            className="relative z-10 w-full h-full md:w-full md:max-w-[1100px] md:h-[680px] flex items-center max-h-none"
          >
            <div className="relative w-full h-full overflow-hidden rounded-none md:rounded-[2.5rem] bg-[#F8F7F3] md:bg-black/10 shadow-none md:shadow-2xl md:p-6 md:flex md:items-stretch">
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
