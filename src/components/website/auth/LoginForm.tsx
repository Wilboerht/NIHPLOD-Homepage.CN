"use client";

import Image from "next/image";
import { m } from "framer-motion";
import { Eye, EyeOff, ArrowLeftRight, MessageCircle, Music2 } from "lucide-react";
import {
  pcInputClass,
  pcInputErrorClass,
  pcBtnClass,
  mobileInputClass,
  mobileInputFlexClass,
  mobileInputErrorClass,
  mobileInputErrorFlexClass,
} from "./auth-styles";
import { Checkbox } from "@/components/ui/Checkbox";
import { AuthFieldError, type AuthFieldErrors } from "./AuthFieldError";
import { AuthFormNotice } from "./AuthFormNotice";

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
  /** 字段级内联错误 */
  errors?: AuthFieldErrors;
  /** 表单级错误（服务端返回），展示在协议勾选下方、提交按钮上方 */
  formError?: string;
  /** 表单顶部成功提示（如重置密码后回到登录） */
  notice?: string;
  /** PoW 求解中（密码登录提交）：登录按钮原位显示「核验中…」 */
  submitVerifying?: boolean;
  /** PoW 求解中（发送登录验证码）：发码按钮原位显示「核验中…」 */
  codeVerifying?: boolean;
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
  onDouyinLogin?: () => void;
}

/** 协议勾选组件（PC + 移动端共用；登录/绑定页复用） */
export function AgreementCheckbox({
  checked,
  onChange,
  agreementShake,
  disabled = false,
  error,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  agreementShake: number;
  disabled?: boolean;
  error?: string;
}) {
  return (
    <div>
      <m.div
        key={agreementShake}
        initial={{ x: 0 }}
        animate={{ x: [-5, 5, -5, 5, -3, 3, 0] }}
        transition={{ duration: 0.4 }}
      >
        <Checkbox
          id="login-agreement"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          label={
            <span className="text-xs tracking-wide text-brand-charcoal/70">
              我已阅读并同意
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-brand-charcoal/20 underline-offset-2 transition-colors hover:text-brand-charcoal"
              >
                《用户协议》
              </a>
              和
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-brand-charcoal/20 underline-offset-2 transition-colors hover:text-brand-charcoal"
              >
                《隐私政策》
              </a>
            </span>
          }
        />
      </m.div>
      <AuthFieldError message={error} />
    </div>
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
  errors,
  formError,
  notice,
  submitVerifying,
  codeVerifying,
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
  onDouyinLogin,
}: LoginFormProps) {
  const agreed = mobileAgreed;

  if (variant === "pc") {
    return (
      <>
        <h1 className="mb-14 text-center text-[2rem] font-light tracking-[0.15em] text-brand-charcoal">
          登录
        </h1>
        <form id="pc-login-form" onSubmit={onSubmit} className="space-y-10">
          <AuthFormNotice message={notice} tone="success" />
          <div>
            <input
              type="tel"
              required
              value={loginPhone}
              onChange={(e) => onLoginPhoneChange(e.target.value.replace(/\D/g, "").slice(0, 11))}
              className={errors?.phone ? pcInputErrorClass : pcInputClass}
              maxLength={11}
              autoComplete="tel"
              placeholder="手机号"
            />
            <AuthFieldError message={errors?.phone} />
          </div>

          {loginMethod === "code" && (
            <div>
              <div className="relative flex gap-3">
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={loginCode}
                  onChange={(e) => onLoginCodeChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className={`${errors?.code ? pcInputErrorClass : pcInputClass} flex-1`}
                  autoComplete="one-time-code"
                  placeholder="验证码"
                />
                <button
                  type="button"
                  onClick={onSendLoginCode}
                  disabled={
                    loginCodeSending ||
                    loginCodeCountdown > 0 ||
                    loginPhone.length !== 11 ||
                    codeVerifying
                  }
                  className="mb-2 shrink-0 self-end border border-brand-charcoal/25 px-4 py-2 text-xs font-light tracking-[0.12em] text-brand-charcoal/80 transition-all hover:bg-brand-charcoal/[0.02] disabled:opacity-30"
                >
                  {codeVerifying
                    ? "核验中…"
                    : loginCodeCountdown > 0
                      ? `${loginCodeCountdown}s`
                      : "获取验证码"}
                </button>
              </div>
              <AuthFieldError message={errors?.code} />
              {!errors?.code && loginCodeCountdown > 0 && (
                <p className="mt-1.5 text-xs tracking-wide text-brand-charcoal/50">
                  验证码已发送，请注意查收
                </p>
              )}
            </div>
          )}

          {loginMethod === "password" && (
            <div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={loginPassword}
                  onChange={(e) => onLoginPasswordChange(e.target.value)}
                  className={`${errors?.password ? pcInputErrorClass : pcInputClass} pr-10`}
                  maxLength={128}
                  autoComplete="current-password"
                  placeholder="密码"
                />
                <button
                  type="button"
                  onClick={onShowPasswordToggle}
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  className="absolute right-0 top-1/2 -translate-y-1/2 text-brand-charcoal/40 transition-colors hover:text-brand-charcoal/70"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <AuthFieldError message={errors?.password} />
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onLoginMethodToggle}
              className="inline-flex items-center gap-1.5 text-xs tracking-wider text-brand-charcoal/70 transition-colors hover:text-brand-charcoal"
            >
              <ArrowLeftRight className="h-3 w-3" strokeWidth={2} />
              {loginMethod === "password" ? "验证码登录" : "密码登录"}
            </button>
            {loginMethod === "password" && (
              <button
                type="button"
                onClick={onForgotPassword}
                className="text-xs tracking-wider text-brand-charcoal/70 transition-colors hover:text-brand-charcoal"
              >
                忘记密码？
              </button>
            )}
          </div>

          <AgreementCheckbox
            checked={agreed}
            onChange={onMobileAgreedChange}
            agreementShake={agreementShake}
            error={errors?.agreement}
          />
          <AuthFormNotice message={formError} />
        </form>

        <div className="mt-10 flex flex-col gap-6 text-center">
          <button
            type="submit"
            form="pc-login-form"
            disabled={loading || submitVerifying}
            className={`${pcBtnClass} ${!agreed && !loading && !submitVerifying ? "cursor-not-allowed opacity-40" : ""}`}
          >
            {submitVerifying ? (
              "核验中…"
            ) : loading ? (
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
            className="inline-flex items-center justify-center border border-brand-charcoal/25 px-6 py-2 text-xs font-light tracking-[0.12em] text-brand-charcoal/80 transition-all hover:bg-brand-charcoal/[0.03] hover:text-brand-charcoal"
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
          {onDouyinLogin && (
            <button
              type="button"
              onClick={onDouyinLogin}
              className="inline-flex h-7 min-h-0 items-center justify-center gap-1.5 text-xs tracking-wide text-brand-charcoal/40 transition-colors hover:text-brand-charcoal/70"
            >
              <Music2 className="h-3.5 w-3.5" />
              抖音登录
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
        <AuthFormNotice message={notice} tone="success" />
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
            className={errors?.phone ? mobileInputErrorClass : mobileInputClass}
          />
          <AuthFieldError message={errors?.phone} />
        </div>

        {loginMethod === "code" && (
          <div className="animate-fade-scale-in">
            <div className="relative flex gap-2">
              <input
                type="text"
                required
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={loginCode}
                onChange={(e) => onLoginCodeChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="验证码"
                className={errors?.code ? mobileInputErrorFlexClass : mobileInputFlexClass}
              />
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={onSendLoginCode}
                  disabled={
                    loginCodeCountdown > 0 ||
                    loginPhone.length !== 11 ||
                    loginCodeSending ||
                    codeVerifying
                  }
                  className="inline-flex h-12 min-h-0 items-center justify-center border border-brand-charcoal/25 px-4 text-xs font-light tracking-[0.12em] text-brand-charcoal/80 transition-all disabled:opacity-30"
                >
                  {codeVerifying
                    ? "核验中…"
                    : loginCodeCountdown > 0
                      ? `${loginCodeCountdown}s`
                      : "获取验证码"}
                </button>
              </div>
            </div>
            <AuthFieldError message={errors?.code} />
            {!errors?.code && loginCodeCountdown > 0 && (
              <p className="mt-1.5 text-xs tracking-wide text-brand-charcoal/50">
                验证码已发送，请注意查收
              </p>
            )}
          </div>
        )}

        {loginMethod === "password" && (
          <div className="animate-fade-scale-in">
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={loginPassword}
                onChange={(e) => onLoginPasswordChange(e.target.value)}
                placeholder="密码"
                className={`${errors?.password ? mobileInputErrorClass : mobileInputClass} pr-10`}
                maxLength={128}
              />
              <button
                type="button"
                onClick={onShowPasswordToggle}
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
                className="absolute right-0 top-1/2 -translate-y-1/2 text-brand-charcoal/40 transition-colors hover:text-brand-charcoal/70"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <AuthFieldError message={errors?.password} />
          </div>
        )}

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onLoginMethodToggle}
            className={`inline-flex h-7 min-h-0 items-center gap-1.5 text-xs tracking-wider transition-colors ${
              loginMethod === "code"
                ? "text-brand-charcoal"
                : "text-brand-charcoal/70 hover:text-brand-charcoal"
            }`}
          >
            <ArrowLeftRight className="h-3 w-3" strokeWidth={2} />
            {loginMethod === "password" ? "验证码登录" : "密码登录"}
          </button>
          {loginMethod === "password" && (
            <button
              type="button"
              onClick={onForgotPassword}
              className="inline-flex h-7 min-h-0 items-center text-xs tracking-wider text-brand-charcoal/70 transition-colors hover:text-brand-charcoal"
            >
              找回密码
            </button>
          )}
        </div>

        <AgreementCheckbox
          checked={agreed}
          onChange={onMobileAgreedChange}
          agreementShake={agreementShake}
          error={errors?.agreement}
        />
        <AuthFormNotice message={formError} />
      </form>

      <div className="flex flex-col gap-6">
        <div className="pt-2">
          <button
            type="submit"
            form="mobile-login-form"
            disabled={loading || submitVerifying}
            className={`min-h-12 w-full border border-brand-charcoal/25 py-3.5 text-sm font-light tracking-[0.15em] text-brand-charcoal transition-all hover:bg-brand-charcoal/[0.03] active:scale-[0.98] disabled:opacity-40 ${!agreed && !loading && !submitVerifying ? "cursor-not-allowed opacity-40" : ""}`}
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              {submitVerifying ? (
                "核验中…"
              ) : loading ? (
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
          className="inline-flex h-7 min-h-0 items-center justify-center text-xs tracking-wide text-brand-charcoal/70 transition-colors hover:text-brand-charcoal/90"
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
        {onDouyinLogin && (
          <button
            type="button"
            onClick={onDouyinLogin}
            className="inline-flex h-7 min-h-0 items-center justify-center gap-1.5 text-xs tracking-wide text-brand-charcoal/40 transition-colors hover:text-brand-charcoal/70"
          >
            <Music2 className="h-3.5 w-3.5" />
            抖音登录
          </button>
        )}
      </div>
    </div>
  );
}
