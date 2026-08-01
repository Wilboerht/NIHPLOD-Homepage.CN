"use client";

import Image from "next/image";
import { m } from "framer-motion";
import { Eye, EyeOff, ArrowLeftRight, Check, CheckCircle, MessageCircle } from "lucide-react";
import { pcInputClass, pcBtnClass, mobileInputClass, mobileInputFlexClass } from "./auth-styles";

export interface LoginFormProps {
  /** "pc" | "mobile" — 渲染桌面端或移动端布局 */
  variant: "pc" | "mobile";
  /** 表单数据 */
  loginPhone: string;
  loginPassword: string;
  loginCode: string;
  loginMethod: "password" | "code";
  showPassword: boolean;
  loginCodeCountdown: number;
  loginCodeSending: boolean;
  mobileAgreed: boolean;
  agreementShake: number;
  loading: boolean;
  /** Setters */
  onLoginPhoneChange: (v: string) => void;
  onLoginPasswordChange: (v: string) => void;
  onLoginCodeChange: (v: string) => void;
  onShowPasswordToggle: () => void;
  onLoginMethodToggle: () => void;
  onMobileAgreedChange: (v: boolean) => void;
  /** Handlers */
  onSubmit: (e: React.FormEvent) => void;
  onSendLoginCode: () => void;
  onSwitchToRegister: () => void;
  onForgotPassword: () => void;
  onWechatLogin?: () => void;
}

/** 协议勾选组件（PC + 移动端共用） */
function AgreementCheckbox({
  checked,
  onChange,
  agreementShake,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  agreementShake: number;
  disabled?: boolean;
}) {
  return (
    <m.div
      key={agreementShake}
      initial={{ x: 0 }}
      animate={{ x: [-5, 5, -5, 5, -3, 3, 0] }}
      transition={{ duration: 0.4 }}
    >
      <label className="group/agreement flex cursor-pointer items-center gap-2.5">
        <div className="relative flex-shrink-0">
          <input
            type="checkbox"
            disabled={disabled}
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            className="peer sr-only"
          />
          <div className="h-4 w-4 rounded border border-brand-charcoal/25 bg-transparent transition-all peer-checked:border-brand-charcoal/50 peer-checked:bg-brand-charcoal/50" />
          <Check
            className="absolute inset-0 m-auto h-3 w-3 scale-0 text-white transition-transform peer-checked:scale-100"
            strokeWidth={3}
          />
        </div>
        <span className="text-xs tracking-wide text-brand-charcoal/50">
          我已阅读并同意
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline decoration-brand-charcoal/20 underline-offset-2 transition-colors hover:text-brand-charcoal">
            《用户协议》
          </a>
          和
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline decoration-brand-charcoal/20 underline-offset-2 transition-colors hover:text-brand-charcoal">
            《隐私政策》
          </a>
        </span>
      </label>
    </m.div>
  );
}

export function LoginForm({
  variant,
  loginPhone,
  loginPassword,
  loginCode,
  loginMethod,
  showPassword,
  loginCodeCountdown,
  loginCodeSending,
  mobileAgreed,
  agreementShake,
  loading,
  onLoginPhoneChange,
  onLoginPasswordChange,
  onLoginCodeChange,
  onShowPasswordToggle,
  onLoginMethodToggle,
  onMobileAgreedChange,
  onSubmit,
  onSendLoginCode,
  onSwitchToRegister,
  onForgotPassword,
  onWechatLogin,
}: LoginFormProps) {
  const agreed = mobileAgreed;

  if (variant === "pc") {
    return (
      <>
        <h1 className="mb-14 text-center text-[2rem] font-light tracking-[0.15em] text-brand-charcoal">
          登录
        </h1>
        <form id="pc-login-form" onSubmit={onSubmit} className="space-y-10">
          <div>
            <input
              type="tel"
              required
              value={loginPhone}
              onChange={(e) => onLoginPhoneChange(e.target.value.replace(/\D/g, "").slice(0, 11))}
              className={pcInputClass}
              maxLength={11}
              autoComplete="tel"
              placeholder="手机号"
            />
          </div>

          {loginMethod === "code" && (
            <div className="relative flex gap-3">
              <input
                type="text"
                required
                maxLength={6}
                value={loginCode}
                onChange={(e) => onLoginCodeChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className={`${pcInputClass} flex-1`}
                autoComplete="one-time-code"
                placeholder="验证码"
              />
              <button
                type="button"
                onClick={onSendLoginCode}
                disabled={loginCodeSending || loginCodeCountdown > 0 || loginPhone.length !== 11}
                className="mb-2 shrink-0 self-end border border-brand-charcoal/25 px-4 py-2 text-xs font-light tracking-[0.12em] text-brand-charcoal/60 transition-all hover:bg-brand-charcoal/[0.02] disabled:opacity-30"
              >
                {loginCodeCountdown > 0 ? `${loginCodeCountdown}s` : "获取验证码"}
              </button>
            </div>
          )}

          {loginMethod === "password" && (
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={loginPassword}
                onChange={(e) => onLoginPasswordChange(e.target.value)}
                className={`${pcInputClass} pr-10`}
                maxLength={64}
                autoComplete="current-password"
                placeholder="密码"
              />
              <button
                type="button"
                onClick={onShowPasswordToggle}
                className="absolute right-0 top-1/2 -translate-y-1/2 text-brand-charcoal/40 transition-colors hover:text-brand-charcoal/70"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onLoginMethodToggle}
              className="inline-flex items-center gap-1.5 text-xs tracking-wider text-brand-charcoal/50 transition-colors hover:text-brand-charcoal"
            >
              <ArrowLeftRight className="h-3 w-3" strokeWidth={2} />
              {loginMethod === "password" ? "验证码登录" : "密码登录"}
            </button>
            {loginMethod === "password" && (
              <button
                type="button"
                onClick={onForgotPassword}
                className="text-xs tracking-wider text-brand-charcoal/50 transition-colors hover:text-brand-charcoal"
              >
                忘记密码？
              </button>
            )}
          </div>

          <AgreementCheckbox
            checked={agreed}
            onChange={onMobileAgreedChange}
            agreementShake={agreementShake}
          />
        </form>

        <div className="mt-10 flex flex-col gap-6 text-center">
          <button
            type="submit"
            form="pc-login-form"
            disabled={loading}
            className={`${pcBtnClass} ${!agreed && !loading ? "cursor-not-allowed opacity-40" : ""}`}
          >
            {loading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-charcoal/20 border-t-brand-charcoal" />
            ) : (
              "登录"
            )}
          </button>
        </div>

        <div className="mt-6 flex flex-col items-center gap-3 text-center">
          <button
            type="button"
            onClick={onSwitchToRegister}
            className="inline-flex h-7 min-h-0 items-center justify-center text-xs tracking-wide text-brand-charcoal/40 transition-colors hover:text-brand-charcoal/70"
          >
            还没有账号？立即注册
          </button>
          {onWechatLogin && (
            <button
              type="button"
              onClick={onWechatLogin}
              className="inline-flex h-7 min-h-0 items-center justify-center gap-1.5 text-xs tracking-wide text-brand-charcoal/40 transition-colors hover:text-brand-charcoal/70"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              微信登录
            </button>
          )}
        </div>
      </>
    );
  }

  // Mobile layout
  return (
    <div className="flex flex-col gap-14">
      <div className="flex justify-center">
        <Image
          src="/images/NIHPLOD-logo.svg"
          alt="NIHPLOD Logo"
          width={140}
          height={56}
          className="h-auto w-[140px] object-contain"
          priority
        />
      </div>
      <form id="mobile-login-form" onSubmit={onSubmit} className="w-full space-y-6">
        <div>
          <input
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="tel"
            required
            value={loginPhone}
            onChange={(e) => onLoginPhoneChange(e.target.value.replace(/\D/g, "").slice(0, 11))}
            maxLength={11}
            placeholder="手机号"
            className={mobileInputClass}
          />
        </div>

        {loginMethod === "code" && (
          <div className="animate-fade-scale-in relative flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={loginCode}
              onChange={(e) => onLoginCodeChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="验证码"
              className={mobileInputFlexClass}
            />
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={onSendLoginCode}
                disabled={loginCodeCountdown > 0 || loginPhone.length !== 11 || loginCodeSending}
                className="inline-flex h-12 min-h-0 items-center justify-center border border-brand-charcoal/25 px-4 text-xs font-light tracking-[0.12em] text-brand-charcoal/60 transition-all disabled:opacity-30"
              >
                {loginCodeCountdown > 0 ? `${loginCodeCountdown}s` : "获取验证码"}
              </button>
            </div>
          </div>
        )}

        {loginMethod === "password" && (
          <div className="animate-fade-scale-in relative">
            <input
              type={showPassword ? "text" : "password"}
              required
              value={loginPassword}
              onChange={(e) => onLoginPasswordChange(e.target.value)}
              placeholder="密码"
              maxLength={64}
              className={`${mobileInputClass} pr-10`}
            />
            <button
              type="button"
              onClick={onShowPasswordToggle}
              className="absolute right-0 top-1/2 -translate-y-1/2 text-brand-charcoal/40 transition-colors hover:text-brand-charcoal/70"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        )}

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onLoginMethodToggle}
            className={`inline-flex h-7 min-h-0 items-center gap-1.5 text-xs tracking-wider transition-colors ${
              loginMethod === "code" ? "text-brand-charcoal" : "text-brand-charcoal/50 hover:text-brand-charcoal"
            }`}
          >
            <ArrowLeftRight className="h-3 w-3" strokeWidth={2} />
            {loginMethod === "password" ? "验证码登录" : "密码登录"}
          </button>
          {loginMethod === "password" && (
            <button
              type="button"
              onClick={onForgotPassword}
              className="inline-flex h-7 min-h-0 items-center text-xs tracking-wider text-brand-charcoal/50 transition-colors hover:text-brand-charcoal"
            >
              找回密码
            </button>
          )}
        </div>

        <AgreementCheckbox
          checked={agreed}
          onChange={onMobileAgreedChange}
          agreementShake={agreementShake}
        />
      </form>

      <div className="flex flex-col gap-6">
        <div className="pt-2">
          <button
            type="submit"
            form="mobile-login-form"
            disabled={loading}
            className={`min-h-12 w-full border border-brand-charcoal/25 py-3.5 text-sm font-light tracking-[0.15em] text-brand-charcoal transition-all hover:bg-brand-charcoal/[0.03] active:scale-[0.98] disabled:opacity-40 ${!agreed && !loading ? "cursor-not-allowed opacity-40" : ""}`}
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-charcoal/20 border-t-brand-charcoal" />
              ) : (
                "立即登录"
              )}
            </span>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={onSwitchToRegister}
          className="inline-flex h-7 min-h-0 items-center justify-center text-xs tracking-wide text-brand-charcoal/40 transition-colors hover:text-brand-charcoal/70"
        >
          还没有账户？立即注册
        </button>
        {onWechatLogin && (
          <button
            type="button"
            onClick={onWechatLogin}
            className="inline-flex h-7 min-h-0 items-center justify-center gap-1.5 text-xs tracking-wide text-brand-charcoal/40 transition-colors hover:text-brand-charcoal/70"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            微信登录
          </button>
        )}
      </div>
    </div>
  );
}
