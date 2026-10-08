"use client";

import { useState } from "react";
import { m } from "framer-motion";
import { Eye, EyeOff, Phone } from "lucide-react";
import {
  pcInputClass,
  pcInputErrorClass,
  pcBtnClass,
  mobileInputClass,
  mobileInputFlexClass,
  mobileInputErrorClass,
  mobileInputErrorFlexClass,
  mobileBtnClass,
} from "./auth-styles";
import { PASSWORD_MIN_LENGTH } from "./auth-utils";
import { AuthFieldError, type AuthFieldErrors } from "./AuthFieldError";
import { AuthFormNotice } from "./AuthFormNotice";

export interface ForgotPasswordFormProps {
  variant: "pc" | "mobile";
  forgotPhone: string;
  forgotSubmitted: boolean;
  resetCode: string;
  resetNewPassword: string;
  resetConfirmPassword: string;
  showPassword: boolean;
  resetCountdown: number;
  mobileForgotStep: "phone" | "code" | "password" | "success";
  loading: boolean;
  /** 字段级内联错误 */
  errors?: AuthFieldErrors;
  /** 表单级错误（服务端返回），展示在操作按钮上方 */
  formError?: string;
  /** PoW 人机验证求解中：按钮原位显示「核验中…」 */
  captchaSolving?: boolean;
  onForgotPhoneChange: (v: string) => void;
  onResetCodeChange: (v: string) => void;
  onResetNewPasswordChange: (v: string) => void;
  onResetConfirmPasswordChange: (v: string) => void;
  onShowPasswordToggle: () => void;
  onSendResetLink: (e: React.SyntheticEvent) => void;
  onMobileSendResetCode: () => void;
  onResetPassword: (e: React.FormEvent) => void;
  onMobileResetPassword: (e: React.FormEvent) => void;
  onSwitchToLogin: () => void;
  onMobileForgotStepChange: (step: "phone" | "code" | "password" | "success") => void;
  setLoginPhone?: (v: string) => void;
}

export function ForgotPasswordForm({
  variant,
  forgotPhone,
  forgotSubmitted,
  resetCode,
  resetNewPassword,
  resetConfirmPassword,
  showPassword,
  resetCountdown,
  mobileForgotStep,
  loading,
  errors,
  formError,
  captchaSolving,
  onForgotPhoneChange,
  onResetCodeChange,
  onResetNewPasswordChange,
  onResetConfirmPasswordChange,
  onShowPasswordToggle,
  onSendResetLink,
  onMobileSendResetCode,
  onResetPassword,
  onMobileResetPassword,
  onSwitchToLogin,
  onMobileForgotStepChange,
  setLoginPhone,
}: ForgotPasswordFormProps) {
  // 移动端「验证码 → 设置新密码」步骤切换的本地校验错误（该步骤不涉及服务端提交）
  const [codeStepError, setCodeStepError] = useState("");

  if (variant === "pc") {
    return (
      <m.div
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.8, 0, 0.13, 1] }}
      >
        <h1 className="mb-14 text-center text-[2rem] font-light tracking-[0.15em] text-brand-charcoal">
          {forgotSubmitted ? "重置密码" : "找回密码"}
        </h1>
        {forgotSubmitted ? (
          <form onSubmit={onResetPassword} className="space-y-10">
            <p className="text-center text-sm tracking-wide text-brand-charcoal/80">
              验证码已发送至 {forgotPhone.slice(0, 3)}****{forgotPhone.slice(-4)}
            </p>
            <div>
              <input
                type="text"
                required
                maxLength={6}
                value={resetCode}
                onChange={(e) => onResetCodeChange(e.target.value)}
                className={errors?.code ? pcInputErrorClass : pcInputClass}
                placeholder="6位验证码"
              />
              <AuthFieldError message={errors?.code} />
            </div>
            <div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                  value={resetNewPassword}
                  onChange={(e) => onResetNewPasswordChange(e.target.value)}
                  className={`${errors?.password ? pcInputErrorClass : pcInputClass} pr-10`}
                  maxLength={64}
                  autoComplete="new-password"
                  placeholder="新密码（8位且含大写/小写/数字）"
                />
                <button
                  type="button"
                  onClick={onShowPasswordToggle}
                  className="absolute right-0 top-1/2 -translate-y-1/2 text-brand-charcoal/40 transition-colors hover:text-brand-charcoal/70"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <AuthFieldError message={errors?.password} />
            </div>
            <div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                  value={resetConfirmPassword}
                  onChange={(e) => onResetConfirmPasswordChange(e.target.value)}
                  className={`${errors?.confirmPassword ? pcInputErrorClass : pcInputClass} pr-10`}
                  maxLength={64}
                  placeholder="确认密码"
                />
                <button
                  type="button"
                  onClick={onShowPasswordToggle}
                  className="absolute right-0 top-1/2 -translate-y-1/2 text-brand-charcoal/40 transition-colors hover:text-brand-charcoal/70"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <AuthFieldError message={errors?.confirmPassword} />
            </div>
            <AuthFormNotice message={formError} />
            <button type="submit" disabled={loading} className={pcBtnClass}>
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-charcoal/20 border-t-brand-charcoal" />
              ) : (
                "确认重置"
              )}
            </button>
            <div className="text-center">
              <button
                type="button"
                onClick={onSendResetLink}
                disabled={loading || resetCountdown > 0 || captchaSolving}
                className="text-xs tracking-wider text-brand-charcoal/70 transition-colors hover:text-brand-charcoal disabled:opacity-40"
              >
                {captchaSolving
                  ? "核验中…"
                  : resetCountdown > 0
                    ? `${resetCountdown}s 后重新发送`
                    : "重新发送验证码"}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={onSendResetLink} className="space-y-10">
            <p className="text-center text-[14px] font-light tracking-[0.08em] text-brand-charcoal/80">
              请输入您的注册手机号，我们将向您发送重置密码的验证码。
            </p>
            <div>
              <div className="relative">
                <Phone className="absolute left-0 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-charcoal/40" />
                <input
                  type="tel"
                  required
                  value={forgotPhone}
                  onChange={(e) => onForgotPhoneChange(e.target.value)}
                  className={`${errors?.phone ? pcInputErrorClass : pcInputClass} pl-8`}
                  maxLength={11}
                  placeholder="手机号"
                />
              </div>
              <AuthFieldError message={errors?.phone} />
            </div>
            <AuthFormNotice message={formError} />
            <button type="submit" disabled={loading || captchaSolving} className={pcBtnClass}>
              {captchaSolving ? (
                "核验中…"
              ) : loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-charcoal/20 border-t-brand-charcoal" />
              ) : (
                "发送验证码"
              )}
            </button>
          </form>
        )}
        <div className="mt-10 text-center">
          <button
            onClick={onSwitchToLogin}
            className="text-xs tracking-wider text-brand-charcoal/70 transition-colors hover:text-brand-charcoal/90"
          >
            返回登录
          </button>
        </div>
      </m.div>
    );
  }

  // Mobile
  return (
    <m.div
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.8, 0, 0.13, 1] }}
      className="flex flex-col gap-14"
    >
      <div className="pb-4 pt-[6px] text-center">
        <h2 className="text-[24px] font-light tracking-[0.15em] text-brand-charcoal">找回密码</h2>
        <div className="mx-auto mt-2 w-[70px] border-b border-brand-charcoal" />
      </div>
      <div className="space-y-6">
        {mobileForgotStep === "phone" && (
          <div className="space-y-6">
            <div>
              <input
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="tel"
                required
                value={forgotPhone}
                onChange={(e) =>
                  onForgotPhoneChange(e.target.value.replace(/\D/g, "").slice(0, 11))
                }
                maxLength={11}
                placeholder="手机号"
                className={errors?.phone ? mobileInputErrorClass : mobileInputClass}
              />
              <AuthFieldError message={errors?.phone} />
            </div>
            <AuthFormNotice message={formError} />
            <button
              type="button"
              onClick={onMobileSendResetCode}
              disabled={loading || forgotPhone.length !== 11 || captchaSolving}
              className={mobileBtnClass}
            >
              {captchaSolving ? "核验中…" : loading ? "发送中..." : "找回密码"}
            </button>
          </div>
        )}

        {mobileForgotStep === "code" && (
          <div className="space-y-6">
            <p className="text-center text-sm text-brand-charcoal/80">
              验证码已发送至 {forgotPhone.slice(0, 3)}****{forgotPhone.slice(-4)}
            </p>
            <div>
              <div className="relative flex gap-2">
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={resetCode}
                  onChange={(e) => {
                    setCodeStepError("");
                    onResetCodeChange(e.target.value.replace(/\D/g, "").slice(0, 6));
                  }}
                  placeholder="6位验证码"
                  className={
                    errors?.code || codeStepError
                      ? mobileInputErrorFlexClass
                      : mobileInputFlexClass
                  }
                />
              </div>
              <AuthFieldError message={errors?.code || codeStepError} />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => onMobileForgotStepChange("phone")}
                className="flex-1 border border-brand-charcoal/25 py-3 text-xs font-light tracking-[0.15em] text-brand-charcoal/60 transition-all hover:bg-brand-charcoal/[0.03] active:scale-[0.98]"
              >
                修改手机号
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!/^\d{6}$/.test(resetCode)) {
                    setCodeStepError("请输入6位验证码");
                    return;
                  }
                  setCodeStepError("");
                  onMobileForgotStepChange("password");
                }}
                disabled={resetCode.length !== 6}
                className="flex-1 border border-brand-charcoal/25 py-3 text-xs font-light tracking-[0.15em] text-brand-charcoal transition-all hover:bg-brand-charcoal/[0.03] active:scale-[0.98] disabled:opacity-40"
              >
                下一步
              </button>
            </div>
            <p className="text-center text-xs font-light text-brand-charcoal/70">
              {captchaSolving ? (
                "核验中…"
              ) : resetCountdown > 0 ? (
                `${resetCountdown}秒后可重新发送`
              ) : (
                <button
                  type="button"
                  onClick={onMobileSendResetCode}
                  className="text-brand-primary hover:underline"
                >
                  重新发送验证码
                </button>
              )}
            </p>
          </div>
        )}

        {mobileForgotStep === "password" && (
          <form onSubmit={onMobileResetPassword} className="space-y-6">
            <div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                  value={resetNewPassword}
                  onChange={(e) => onResetNewPasswordChange(e.target.value)}
                  placeholder="新密码（8位且含大写/小写/数字）"
                  maxLength={64}
                  className={`${errors?.password ? mobileInputErrorClass : mobileInputClass} pr-10`}
                />
                <button
                  type="button"
                  onClick={onShowPasswordToggle}
                  className="absolute right-0 top-1/2 -translate-y-1/2 text-brand-charcoal/40 transition-colors hover:text-brand-charcoal/70"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <AuthFieldError message={errors?.password} />
            </div>
            <div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                  value={resetConfirmPassword}
                  onChange={(e) => onResetConfirmPasswordChange(e.target.value)}
                  placeholder="确认密码"
                  maxLength={64}
                  className={`${errors?.confirmPassword ? mobileInputErrorClass : mobileInputClass} pr-10`}
                />
                <button
                  type="button"
                  onClick={onShowPasswordToggle}
                  className="absolute right-0 top-1/2 -translate-y-1/2 text-brand-charcoal/40 transition-colors hover:text-brand-charcoal/70"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <AuthFieldError message={errors?.confirmPassword} />
            </div>
            <AuthFormNotice message={formError} />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => onMobileForgotStepChange("code")}
                className="flex-1 border border-brand-charcoal/25 py-3 text-xs font-light tracking-[0.15em] text-brand-charcoal/60 transition-all hover:bg-brand-charcoal/[0.03] active:scale-[0.98]"
              >
                返回上一步
              </button>
              <button type="submit" disabled={loading} className={`${mobileBtnClass} flex-1`}>
                {loading ? "重置中..." : "重置密码"}
              </button>
            </div>
          </form>
        )}

        {mobileForgotStep === "success" && (
          <div className="space-y-6 text-center">
            <p className="text-brand-charcoal/80">密码重置成功！</p>
            <button
              type="button"
              onClick={() => {
                onSwitchToLogin();
                if (setLoginPhone) setLoginPhone(forgotPhone);
              }}
              className={mobileBtnClass}
            >
              返回登录
            </button>
          </div>
        )}
      </div>
    </m.div>
  );
}
