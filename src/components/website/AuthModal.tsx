"use client";

/**
 * 登录/注册/找回密码/微信绑定 认证面板
 * 样式与动画对齐 skin-advisor-standalone：全屏右侧滑入面板（PC 白色 / 移动端米色）
 *
 * 状态管理与事件处理集中在此组件，表单渲染委托给子组件：
 * - LoginForm        (./auth/LoginForm)
 * - RegisterForm     (./auth/RegisterForm)
 * - ForgotPasswordForm (./auth/ForgotPasswordForm)
 * - WechatBindForm   (./auth/WechatBindForm)
 */
import { useState, useEffect } from "react";
import Image from "next/image";
import { m, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { X, ArrowLeft, ChevronLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { apiPost } from "@/lib/api-client";
import { validatePasswordStrength, getErrorMessage } from "./auth/auth-utils";
import { LoginForm } from "./auth/LoginForm";
import { RegisterForm } from "./auth/RegisterForm";
import { ForgotPasswordForm } from "./auth/ForgotPasswordForm";
import { WechatBindForm } from "./auth/WechatBindForm";

export function AuthModal() {
  const _isMobile = useIsMobile();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const {
    activeModal,
    closeModal,
    switchToLogin,
    switchToRegister,
    switchToForgotPassword,
    refreshUser,
    openUserCenter,
  } = useAuth();
  const toast = useToast();

  const isOpen = activeModal !== null;
  const view = activeModal ?? "login";

  // Form States
  const [loading, setLoading] = useState(false);

  // Login Fields
  const [loginPhone, setLoginPhone] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register Fields
  const [regName, setRegName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regCode, setRegCode] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [regCodeSending, setRegCodeSending] = useState(false);
  const [regCountdown, setRegCountdown] = useState(0);
  const [inviteCode, setInviteCode] = useState("");

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

  // Login method toggle
  const [loginMethod, setLoginMethod] = useState<"password" | "code">("password");
  const [loginCode, setLoginCode] = useState("");
  const [loginCodeCountdown, setLoginCodeCountdown] = useState(0);
  const [loginCodeSending, setLoginCodeSending] = useState(false);

  // Reset states when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
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
    }
  }, [isOpen]);

  // Cleanup interval for countdown
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

  // 登录/注册成功后处理
  const handleAuthSuccess = async () => {
    await refreshUser(true);
    closeModal();
    openUserCenter();
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
        inviteCode,
      });
      toast.success("注册成功！");
      await handleAuthSuccess();
    } catch (error) {
      toast.error(getErrorMessage(error, "注册失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  };

  const handleCancelWechatBind = () => {
    toast.error("微信登录已取消，请使用手机号登录");
    closeModal();
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
      // 清理 URL 上的 ?login=wechat_bind 参数
      const newUrl = window.location.pathname;
      window.history.replaceState({}, "", newUrl);
      closeModal();
      openUserCenter();
    } catch (error) {
      toast.error(getErrorMessage(error, "绑定失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  };

  const handleWechatLogin = async () => {
    if (!mobileAgreed) {
      setAgreementShake((n) => n + 1);
      return;
    }
    setLoading(true);
    try {
      const redirect = window.location.pathname + window.location.search;
      window.location.href = `/api/auth/wechat?redirect=${encodeURIComponent(redirect)}`;
    } catch {
      toast.error("网络错误，请重试");
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

  const handleForgotPassword = () => {
    switchToForgotPassword();
    setForgotSubmitted(false);
    setResetCode("");
    setResetNewPassword("");
    setResetConfirmPassword("");
    setMobileForgotStep("phone");
  };

  // 登录面板：发送登录验证码
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

  // 手机端专用：发送重置验证码
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

  // 手机端专用：重置密码
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
      switchToLogin();
      setLoginPhone(forgotPhone);
      // reset form data
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

  return (
    <AnimatePresence>
      {isOpen && (!mounted || !_isMobile) && (
        <>
          <m.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={view === "wechat-bind" ? undefined : closeModal}
            className="fixed inset-0 z-[99998] bg-black/20 backdrop-blur-md"
          />
          <m.div
            key={`pc-panel-${view}`}
            initial={{ x: "100%" }}
            animate={{ x: 0, transition: { duration: 0.8, ease: [0.8, 0, 0.13, 1] } }}
            exit={{ x: "100%", transition: { duration: 0.5, ease: [0.8, 0, 0.13, 1] } }}
            className="fixed inset-y-0 right-0 z-[99999] hidden w-full flex-col bg-white md:flex"
          >
            {/* 关闭/取消按钮 */}
            {view === "wechat-bind" ? (
              <button
                onClick={handleCancelWechatBind}
                disabled={loading}
                className="absolute right-8 top-8 z-20 flex items-center gap-1.5 px-4 py-2 text-sm tracking-wider text-brand-charcoal/50 transition-colors hover:text-brand-charcoal/70"
              >
                取消绑定
              </button>
            ) : (
              <button
                onClick={closeModal}
                disabled={loading}
                className="absolute right-8 top-8 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-brand-charcoal/5 text-brand-charcoal/40 backdrop-blur-sm transition-all hover:bg-brand-charcoal/10 hover:text-brand-charcoal/70"
              >
                <X size={20} strokeWidth={1.5} />
              </button>
            )}

            {/* 返回按钮（非登录页） */}
            {view !== "login" && view !== "wechat-bind" && (
              <button
                onClick={switchToLogin}
                disabled={loading}
                className="absolute left-8 top-8 z-20 flex h-10 w-10 items-center justify-center text-brand-charcoal/40 transition-colors hover:text-brand-charcoal/70"
              >
                <ArrowLeft size={20} strokeWidth={1.5} />
              </button>
            )}

            {/* 内容区域 */}
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

                {view === "login" && (
                  <LoginForm
                    variant="pc"
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
                    onSwitchToRegister={switchToRegister}
                    onForgotPassword={handleForgotPassword}
                  />
                )}

                {view === "register" && (
                  <RegisterForm
                    variant="pc"
                    inviteCode={inviteCode}
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
                    onInviteCodeChange={setInviteCode}
                    onRegNameChange={setRegName}
                    onRegPhoneChange={setRegPhone}
                    onRegCodeChange={setRegCode}
                    onRegPasswordChange={setRegPassword}
                    onRegConfirmPasswordChange={setRegConfirmPassword}
                    onShowPasswordToggle={() => setShowPassword(!showPassword)}
                    onMobileAgreedChange={setMobileAgreed}
                    onSubmit={handleRegister}
                    onSendRegCode={handleSendRegCode}
                    onSwitchToLogin={switchToLogin}
                  />
                )}

                {view === "forgot-password" && (
                  <ForgotPasswordForm
                    variant="pc"
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
                    onSwitchToLogin={switchToLogin}
                    onMobileForgotStepChange={setMobileForgotStep}
                    toast={toast}
                    setLoginPhone={setLoginPhone}
                  />
                )}

                {view === "wechat-bind" && (
                  <WechatBindForm
                    variant="pc"
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
                )}
              </div>
            </div>
          </m.div>
        </>
      )}
      {isOpen && (!mounted || _isMobile) && (
        <m.div
          key={`mobile-modal-${view}`}
          initial={{ x: "100%" }}
          animate={{ x: 0, transition: { duration: 0.8, ease: [0.8, 0, 0.13, 1] } }}
          exit={{ x: "100%", transition: { duration: 0.5, ease: [0.8, 0, 0.13, 1] } }}
          className="fixed inset-0 z-[99999] flex flex-col bg-[#F8F7F3] pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pl-4 pr-4 pt-[calc(1rem+env(safe-area-inset-top,0px))] md:hidden"
        >
          {/* 手机端顶部栏 */}
          <div className="relative flex h-[56px] w-full flex-shrink-0 items-center justify-center">
            <button
              type="button"
              onClick={
                view === "wechat-bind"
                  ? handleCancelWechatBind
                  : view === "forgot-password"
                    ? () => {
                        switchToLogin();
                        setMobileForgotStep("phone");
                      }
                    : closeModal
              }
              className="absolute bottom-0 left-0 top-0 flex items-center justify-center px-4 py-[10px]"
            >
              <ChevronLeft className="h-6 w-6 text-[#00263E]" />
            </button>
            {view !== "login" && (
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
              {view === "login" && (
                <LoginForm
                  variant="mobile"
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
                  onSwitchToRegister={switchToRegister}
                  onForgotPassword={handleForgotPassword}
                />
              )}

              {view === "register" && (
                <RegisterForm
                  variant="mobile"
                  inviteCode={inviteCode}
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
                  onInviteCodeChange={setInviteCode}
                  onRegNameChange={setRegName}
                  onRegPhoneChange={setRegPhone}
                  onRegCodeChange={setRegCode}
                  onRegPasswordChange={setRegPassword}
                  onRegConfirmPasswordChange={setRegConfirmPassword}
                  onShowPasswordToggle={() => setShowPassword(!showPassword)}
                  onMobileAgreedChange={setMobileAgreed}
                  onSubmit={handleRegister}
                  onSendRegCode={handleSendRegCode}
                  onSwitchToLogin={switchToLogin}
                />
              )}

              {view === "forgot-password" && (
                <ForgotPasswordForm
                  variant="mobile"
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
                  onSwitchToLogin={switchToLogin}
                  onMobileForgotStepChange={setMobileForgotStep}
                  toast={toast}
                  setLoginPhone={setLoginPhone}
                />
              )}

              {view === "wechat-bind" && (
                <WechatBindForm
                  variant="mobile"
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
              )}
            </div>
          </div>

          {/* 手机端页脚 */}
          <div className="mx-6 flex-shrink-0 pb-4 pt-4 text-center">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[rgba(123,114,108,0.3)]">
              &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
            </p>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
