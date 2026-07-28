"use client";

/**
 * NIHPLOD 统一登录页
 * /login
 *
 * 作为官网唯一的登录/注册/找回密码/授权确认/微信绑定入口。
 * 视觉与动效完全对齐旧版 AuthModal 弹窗：
 * - PC：右侧固定白色面板，从右侧滑入。
 * - 移动端：全屏米色面板，从右侧滑入。
 */
import { useState, useEffect, Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { m, AnimatePresence } from "framer-motion";
import { X, ArrowLeft, ChevronLeft } from "lucide-react";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { apiPost } from "@/lib/api-client";
import { validatePasswordStrength, getErrorMessage } from "@/components/website/auth/auth-utils";
import { LoginForm } from "@/components/website/auth/LoginForm";
import { RegisterForm } from "@/components/website/auth/RegisterForm";
import { ForgotPasswordForm } from "@/components/website/auth/ForgotPasswordForm";
import { WechatBindForm } from "@/components/website/auth/WechatBindForm";

type AuthMode = "login" | "register" | "reset" | "consent" | "wechat-bind";

const VALID_MODES: AuthMode[] = ["login", "register", "reset", "consent", "wechat-bind"];

function buildLoginUrl(mode: AuthMode, returnTo: string | null, extra: Record<string, string> = {}) {
  const params = new URLSearchParams();
  if (mode !== "login") params.set("mode", mode);
  if (returnTo) params.set("return_to", returnTo);
  Object.entries(extra).forEach(([k, v]) => params.set(k, v));
  const query = params.toString();
  return `/login${query ? `?${query}` : ""}`;
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const _isMobile = useIsMobile();
  const toast = useToast();
  const { refreshUser } = useAuth();

  const returnTo = searchParams.get("return_to");
  const rawMode = searchParams.get("mode");
  const mode: AuthMode = VALID_MODES.includes(rawMode as AuthMode) ? (rawMode as AuthMode) : "login";
  const clientName = searchParams.get("client_name") || "第三方应用";
  const oauthParams = searchParams.get("oauth_params") || "";

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [loading, setLoading] = useState(false);

  // Login Fields
  const [loginPhone, setLoginPhone] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [loginMethod, setLoginMethod] = useState<"password" | "code">("password");
  const [loginCodeCountdown, setLoginCodeCountdown] = useState(0);
  const [loginCodeSending, setLoginCodeSending] = useState(false);

  // Register Fields
  const [regName, setRegName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regCode, setRegCode] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [regCodeSending, setRegCodeSending] = useState(false);
  const [regCountdown, setRegCountdown] = useState(0);

  // Forgot Password Fields
  const [forgotPhone, setForgotPhone] = useState("");
  const [forgotSubmitted, setForgotSubmitted] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetCountdown, setResetCountdown] = useState(0);

  const [showPassword, setShowPassword] = useState(false);
  const [mobileAgreed, setMobileAgreed] = useState(false);
  const [agreementShake, setAgreementShake] = useState(0);
  const [mobileForgotStep, setMobileForgotStep] = useState<
    "phone" | "code" | "password" | "success"
  >("phone");

  const [consentLoading, setConsentLoading] = useState(false);
  const [consentError, setConsentError] = useState("");

  const isMobile = useIsMobile();

  const handleClose = useCallback(() => {
    if (returnTo) {
      router.push(decodeURIComponent(returnTo));
    } else {
      router.push("/");
    }
  }, [router, returnTo]);

  const switchMode = useCallback(
    (nextMode: AuthMode) => {
      const extra: Record<string, string> = {};
      if (mode === "consent" && oauthParams) {
        extra.oauth_params = oauthParams;
      }
      router.replace(buildLoginUrl(nextMode, returnTo, extra));
    },
    [mode, oauthParams, returnTo, router]
  );

  // Reset form states when mode changes (mirrors modal open/close reset)
  useEffect(() => {
    setLoading(false);
    setForgotSubmitted(false);
    setRegCodeSending(false);
    setRegCountdown(0);
    setResetCountdown(0);
    setMobileAgreed(false);
    setMobileForgotStep("phone");
    setLoginMethod("password");
    setLoginCode("");
    setLoginCodeCountdown(0);
    setLoginCodeSending(false);
    setConsentError("");
  }, [mode]);

  // Countdown timers
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (regCountdown > 0) {
      timer = setTimeout(() => setRegCountdown((prev) => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [regCountdown]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resetCountdown > 0) {
      timer = setTimeout(() => setResetCountdown((prev) => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resetCountdown]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (loginCodeCountdown > 0) {
      timer = setTimeout(() => setLoginCodeCountdown((prev) => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [loginCodeCountdown]);

  // Lock body scroll on mobile (same as modal)
  useEffect(() => {
    document.body.style.overflow = "hidden";
    if (isMobile) {
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.width = "100%";
      document.body.style.top = `-${scrollY}px`;
    }
    return () => {
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
    };
  }, [isMobile]);

  const handleAuthSuccess = async () => {
    await refreshUser(true);
    if (returnTo) {
      router.push(decodeURIComponent(returnTo));
    } else {
      router.push("/");
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mobileAgreed) {
      setAgreementShake((n) => n + 1);
      return;
    }
    setLoading(true);
    try {
      if (loginMethod === "code") {
        await apiPost("/api/auth/login", { phone: loginPhone, code: loginCode });
      } else {
        await apiPost("/api/auth/login-password", { phone: loginPhone, password: loginPassword });
      }
      toast.success("欢迎回来！");
      await handleAuthSuccess();
    } catch (error) {
      toast.error(getErrorMessage(error, "登录失败，请检查账号密码"));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regPassword !== regConfirmPassword) {
      toast.error("两次密码输入不一致，请重新输入");
      return;
    }
    const passwordCheck = validatePasswordStrength(regPassword);
    if (!passwordCheck.valid) {
      toast.error(passwordCheck.message || "密码不符合要求");
      return;
    }
    if (!mobileAgreed) {
      setAgreementShake((n) => n + 1);
      return;
    }
    setLoading(true);
    try {
      await apiPost("/api/auth/register", {
        name: regName,
        phone: regPhone,
        code: regCode,
        password: regPassword,
        confirmPassword: regConfirmPassword,
      });
      toast.success("注册成功！");
      await handleAuthSuccess();
    } catch (error) {
      toast.error(getErrorMessage(error, "注册失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  };

  const handleWechatBind = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regPassword || regPassword.length === 0) {
      toast.error("请设置登录密码");
      return;
    }
    const passwordCheck = validatePasswordStrength(regPassword);
    if (!passwordCheck.valid) {
      toast.error(passwordCheck.message || "密码不符合要求");
      return;
    }
    setLoading(true);
    try {
      await apiPost("/api/auth/wechat/bind", {
        phone: regPhone,
        code: regCode,
        password: regPassword,
      });
      toast.success("绑定成功！");
      await refreshUser(true);
      await handleAuthSuccess();
    } catch (error) {
      toast.error(getErrorMessage(error, "绑定失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  };

  const handleSendRegCode = async () => {
    if (!/^1[3-9]\d{9}$/.test(regPhone)) {
      toast.error("请输入正确的手机号");
      return;
    }
    setRegCodeSending(true);
    try {
      await apiPost("/api/auth/send-code", { phone: regPhone, type: "register" });
      toast.success("验证码已发送");
      setRegCountdown(60);
    } catch (error) {
      toast.error(getErrorMessage(error, "发送失败，请稍后重试"));
    } finally {
      setRegCodeSending(false);
    }
  };

  const handleSendResetLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiPost("/api/auth/send-code", { phone: forgotPhone, type: "reset" });
      setForgotSubmitted(true);
      setResetCountdown(60);
      toast.success("重置验证码已发送");
    } catch (error) {
      toast.error(getErrorMessage(error, "发送失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  };

  const handleMobileSendResetCode = async () => {
    if (!/^1[3-9]\d{9}$/.test(forgotPhone)) {
      toast.error("请输入正确的手机号");
      return;
    }
    setLoading(true);
    try {
      await apiPost("/api/auth/send-code", { phone: forgotPhone, type: "reset" });
      setResetCountdown(60);
      setMobileForgotStep("code");
      toast.success("重置验证码已发送");
    } catch (error) {
      toast.error(getErrorMessage(error, "发送失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetNewPassword !== resetConfirmPassword) {
      toast.error("两次密码输入不一致，请重新输入");
      return;
    }
    const passwordCheck = validatePasswordStrength(resetNewPassword);
    if (!passwordCheck.valid) {
      toast.error(passwordCheck.message || "密码不符合要求");
      return;
    }
    setLoading(true);
    try {
      await apiPost("/api/auth/reset-password", {
        phone: forgotPhone,
        code: resetCode,
        password: resetNewPassword,
        confirmPassword: resetConfirmPassword,
      });
      toast.success("密码已重置，请登录");
      switchMode("login");
      setLoginPhone(forgotPhone);
      setResetCode("");
      setResetNewPassword("");
      setResetConfirmPassword("");
      setForgotSubmitted(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "重置失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  };

  const handleMobileResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetNewPassword !== resetConfirmPassword) {
      toast.error("两次密码输入不一致，请重新输入");
      return;
    }
    const passwordCheck = validatePasswordStrength(resetNewPassword);
    if (!passwordCheck.valid) {
      toast.error(passwordCheck.message || "密码不符合要求");
      return;
    }
    setLoading(true);
    try {
      await apiPost("/api/auth/reset-password", {
        phone: forgotPhone,
        code: resetCode,
        password: resetNewPassword,
        confirmPassword: resetConfirmPassword,
      });
      toast.success("密码已重置，请登录");
      setResetCode("");
      setResetNewPassword("");
      setResetConfirmPassword("");
      setMobileForgotStep("success");
    } catch (error) {
      toast.error(getErrorMessage(error, "重置失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  };

  const handleSendLoginCode = async () => {
    if (!/^1[3-9]\d{9}$/.test(loginPhone)) {
      toast.error("请输入正确的手机号");
      return;
    }
    setLoginCodeSending(true);
    try {
      await apiPost("/api/auth/send-code", { phone: loginPhone, type: "login" });
      setLoginCodeCountdown(60);
      toast.success("验证码已发送");
    } catch (error) {
      toast.error(getErrorMessage(error, "发送失败，请稍后重试"));
    } finally {
      setLoginCodeSending(false);
    }
  };

  const handleForgotPassword = () => {
    switchMode("reset");
    setForgotSubmitted(false);
    setResetCode("");
    setResetNewPassword("");
    setResetConfirmPassword("");
    setMobileForgotStep("phone");
  };

  const handleConsent = async (action: "approve" | "deny") => {
    setConsentLoading(true);
    setConsentError("");
    try {
      const params = new URLSearchParams(oauthParams);
      const csrfMatch =
        typeof document !== "undefined"
          ? document.cookie.match(/(?:^|;\\s*)__Host-csrf_token=([^;]*)/)
          : null;
      const csrfToken = csrfMatch ? decodeURIComponent(csrfMatch[1]) : "";
      const res = await fetch("/api/oauth/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        },
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
      setConsentError(data.error_description || "操作失败");
    } catch {
      setConsentError("网络错误");
    } finally {
      setConsentLoading(false);
    }
  };

  const handleWechatLogin = async () => {
    if (!mobileAgreed) {
      setAgreementShake((n) => n + 1);
      return;
    }
    setLoading(true);
    try {
      const redirect = returnTo ? decodeURIComponent(returnTo) : "/";
      window.location.href = `/api/auth/wechat?redirect=${encodeURIComponent(redirect)}`;
    } catch {
      toast.error("网络错误，请重试");
      setLoading(false);
    }
  };

  const handleSwitchToLogin = () => switchMode("login");
  const handleSwitchToRegister = () => switchMode("register");

  const renderForm = (variant: "pc" | "mobile") => {
    switch (mode) {
      case "login":
        return (
          <LoginForm
            variant={variant}
            loginPhone={loginPhone}
            loginPassword={loginPassword}
            loginCode={loginCode}
            loginMethod={loginMethod}
            showPassword={showPassword}
            loginCodeCountdown={loginCodeCountdown}
            loginCodeSending={loginCodeSending}
            mobileAgreed={mobileAgreed}
            agreementShake={agreementShake}
            loading={loading}
            onLoginPhoneChange={setLoginPhone}
            onLoginPasswordChange={setLoginPassword}
            onLoginCodeChange={setLoginCode}
            onShowPasswordToggle={() => setShowPassword(!showPassword)}
            onLoginMethodToggle={() => {
              setLoginMethod(loginMethod === "password" ? "code" : "password");
              setLoginCode("");
              setLoginPassword("");
            }}
            onMobileAgreedChange={setMobileAgreed}
            onSubmit={handleLogin}
            onSendLoginCode={handleSendLoginCode}
            onSwitchToRegister={handleSwitchToRegister}
            onForgotPassword={handleForgotPassword}
            onWechatLogin={handleWechatLogin}
          />
        );
      case "register":
        return (
          <RegisterForm
            variant={variant}
            regName={regName}
            regPhone={regPhone}
            regCode={regCode}
            regPassword={regPassword}
            regConfirmPassword={regConfirmPassword}
            showPassword={showPassword}
            regCodeSending={regCodeSending}
            regCountdown={regCountdown}
            mobileAgreed={mobileAgreed}
            agreementShake={agreementShake}
            loading={loading}
            onRegNameChange={setRegName}
            onRegPhoneChange={setRegPhone}
            onRegCodeChange={setRegCode}
            onRegPasswordChange={setRegPassword}
            onRegConfirmPasswordChange={setRegConfirmPassword}
            onShowPasswordToggle={() => setShowPassword(!showPassword)}
            onMobileAgreedChange={setMobileAgreed}
            onSubmit={handleRegister}
            onSendRegCode={handleSendRegCode}
            onSwitchToLogin={handleSwitchToLogin}
          />
        );
      case "reset":
        return (
          <ForgotPasswordForm
            variant={variant}
            forgotPhone={forgotPhone}
            forgotSubmitted={forgotSubmitted}
            resetCode={resetCode}
            resetNewPassword={resetNewPassword}
            resetConfirmPassword={resetConfirmPassword}
            showPassword={showPassword}
            resetCountdown={resetCountdown}
            mobileForgotStep={mobileForgotStep}
            loading={loading}
            onForgotPhoneChange={setForgotPhone}
            onResetCodeChange={setResetCode}
            onResetNewPasswordChange={setResetNewPassword}
            onResetConfirmPasswordChange={setResetConfirmPassword}
            onShowPasswordToggle={() => setShowPassword(!showPassword)}
            onSendResetLink={handleSendResetLink}
            onMobileSendResetCode={handleMobileSendResetCode}
            onResetPassword={handleResetPassword}
            onMobileResetPassword={handleMobileResetPassword}
            onSwitchToLogin={handleSwitchToLogin}
            onMobileForgotStepChange={setMobileForgotStep}
            toast={toast}
            setLoginPhone={setLoginPhone}
          />
        );
      case "wechat-bind":
        return (
          <WechatBindForm
            variant={variant}
            regPhone={regPhone}
            regCode={regCode}
            regPassword={regPassword}
            showPassword={showPassword}
            regCodeSending={regCodeSending}
            regCountdown={regCountdown}
            loading={loading}
            onRegPhoneChange={setRegPhone}
            onRegCodeChange={setRegCode}
            onRegPasswordChange={setRegPassword}
            onShowPasswordToggle={() => setShowPassword(!showPassword)}
            onSubmit={handleWechatBind}
            onSendRegCode={handleSendRegCode}
          />
        );
      case "consent":
      default:
        return null;
    }
  };

  const scopeDescriptions: Record<string, string> = {
    openid: "唯一用户标识（sub）",
    profile: "昵称、头像",
    phone: "手机号（脱敏后）",
    membership: "会员等级、积分",
  };

  const renderConsent = (variant: "pc" | "mobile") => {
    const params = new URLSearchParams(oauthParams);
    const requestedScopes = (params.get("scope") || "openid")
      .split(" ")
      .map((s) => s.trim())
      .filter(Boolean);

    return (
      <div className={variant === "mobile" ? "flex flex-col gap-14" : ""}>
        {variant === "pc" && (
          <h1 className="mb-14 text-center text-[2rem] font-light tracking-[0.15em] text-brand-charcoal">
            授权登录
          </h1>
        )}
        {variant === "mobile" && (
          <div className="pb-4 pt-[6px] text-center">
            <h2 className="text-[24px] font-light tracking-[0.15em] text-brand-charcoal">授权登录</h2>
            <div className="mx-auto mt-2 w-[70px] border-b border-brand-charcoal" />
          </div>
        )}

        <div className="space-y-10">
          <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-4">
            <p className="text-sm text-brand-charcoal/80">
              <strong>{clientName}</strong> 请求访问您的账户信息
            </p>
            <ul className="mt-2 space-y-1">
              {requestedScopes.map((scope) => (
                <li key={scope} className="flex items-start gap-2 text-xs text-brand-charcoal/70">
                  <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                  <span>
                    <code className="rounded bg-blue-100 px-1 py-0.5 text-blue-700">{scope}</code>
                    {scopeDescriptions[scope] ? ` — ${scopeDescriptions[scope]}` : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>

        {consentError && (
          <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-sm text-red-600">
            {consentError}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => handleConsent("deny")}
            disabled={consentLoading}
            className="flex-1 py-3 border border-brand-charcoal/25 text-sm font-light tracking-[0.12em] text-brand-charcoal transition-all hover:bg-brand-charcoal/[0.03] disabled:opacity-40"
          >
            拒绝
          </button>
          <button
            onClick={() => handleConsent("approve")}
            disabled={consentLoading}
            className="flex-1 py-3 bg-brand-charcoal text-white text-sm font-light tracking-[0.12em] transition-all hover:bg-brand-charcoal/90 disabled:opacity-40"
          >
            {consentLoading ? "处理中..." : "授权登录"}
          </button>
        </div>
      </div>
    </div>
  );
};

  return (
    <AnimatePresence>
      {mounted && (
        <>
          {/* Backdrop (PC only) */}
          {!_isMobile && (
            <m.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              onClick={mode === "wechat-bind" ? undefined : handleClose}
              className="fixed inset-0 z-[99998] bg-black/20 backdrop-blur-md"
            />
          )}

          {/* PC Panel */}
          {!_isMobile && (
            <m.div
              key="pc-panel"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.8, ease: [0.8, 0, 0.13, 1] }}
              className="fixed inset-y-0 right-0 z-[99999] hidden w-full flex-col bg-white md:flex"
            >
              {/* Close / Cancel button */}
              {mode === "wechat-bind" ? (
                <button
                  onClick={handleClose}
                  disabled={loading}
                  className="absolute right-8 top-8 z-20 flex items-center gap-1.5 px-4 py-2 text-sm tracking-wider text-brand-charcoal/50 transition-colors hover:text-brand-charcoal/70"
                >
                  取消绑定
                </button>
              ) : (
                <button
                  onClick={handleClose}
                  disabled={loading}
                  className="absolute right-8 top-8 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-brand-charcoal/5 text-brand-charcoal/40 backdrop-blur-sm transition-all hover:bg-brand-charcoal/10 hover:text-brand-charcoal/70"
                >
                  <X size={20} strokeWidth={1.5} />
                </button>
              )}

              {/* Back button (non-login, non-wechat-bind, non-consent) */}
              {mode !== "login" && mode !== "wechat-bind" && mode !== "consent" && (
                <button
                  onClick={handleSwitchToLogin}
                  disabled={loading}
                  className="absolute left-8 top-8 z-20 flex h-10 w-10 items-center justify-center text-brand-charcoal/40 transition-colors hover:text-brand-charcoal/70"
                >
                  <ArrowLeft size={20} strokeWidth={1.5} />
                </button>
              )}

              {/* Content area */}
              <div className="flex flex-1 flex-col overflow-y-auto px-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="m-auto w-full max-w-[480px] py-12">
                  {/* Logo */}
                  <div className="mb-14 flex justify-center">
                    <Image
                      src="/images/NIHPLOD-logo.svg"
                      alt="NIHPLOD"
                      width={180}
                      height={52}
                      className="h-[52px] w-auto object-contain"
                      priority
                    />
                  </div>

                  {mode === "consent" ? renderConsent("pc") : renderForm("pc")}
                </div>
              </div>
            </m.div>
          )}

          {/* Mobile Panel */}
          {_isMobile && (
            <m.div
              key="mobile-panel"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.8, ease: [0.8, 0, 0.13, 1] }}
              className="fixed inset-0 z-[99999] flex flex-col bg-[#F8F7F3] pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pl-4 pr-4 pt-[calc(1rem+env(safe-area-inset-top,0px))] md:hidden"
            >
              {/* Mobile top bar */}
              <div className="relative flex h-[56px] w-full flex-shrink-0 items-center justify-center">
                <button
                  type="button"
                  onClick={
                    mode === "wechat-bind"
                      ? handleClose
                      : mode === "reset"
                        ? () => {
                            handleSwitchToLogin();
                            setMobileForgotStep("phone");
                          }
                        : handleClose
                  }
                  className="absolute bottom-0 left-0 top-0 flex items-center justify-center px-4 py-[10px]"
                >
                  <ChevronLeft className="h-6 w-6 text-brand-charcoal" />
                </button>
                {mode !== "login" && (
                  <Image
                    src="/images/NIHPLOD-logo.svg"
                    alt="NIHPLOD"
                    width={110}
                    height={28}
                    className="h-auto w-[110px] object-contain"
                  />
                )}
              </div>

              <div className="scrollbar-hide flex flex-1 flex-col overflow-y-auto">
                <div className="flex min-h-full flex-col px-6 before:flex-[1_0_0] before:content-[''] after:flex-[1_0_0] after:content-['']">
                  {mode === "consent" ? renderConsent("mobile") : renderForm("mobile")}
                </div>
              </div>

              {/* Mobile footer */}
              <div className="mx-6 flex-shrink-0 pb-4 pt-4 text-center">
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[rgba(123,114,108,0.3)]">
                  &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
                </p>
              </div>
            </m.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-[#F8F7F3]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-charcoal/20 border-t-brand-charcoal" />
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
