"use client";

import { m } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import {
  pcInputClass,
  pcBtnClass,
  mobileInputClass,
  mobileInputFlexClass,
  mobileBtnClass,
} from "./auth-styles";
import { PASSWORD_MIN_LENGTH } from "./auth-utils";
import { Checkbox } from "@/components/ui/Checkbox";

export interface RegisterFormProps {
  variant: "pc" | "mobile";
  regName: string;
  regPhone: string;
  regCode: string;
  regPassword: string;
  regConfirmPassword: string;
  showPassword: boolean;
  regCodeSending: boolean;
  regCountdown: number;
  mobileAgreed: boolean;
  agreementShake: number;
  loading: boolean;
  onRegNameChange: (v: string) => void;
  onRegPhoneChange: (v: string) => void;
  onRegCodeChange: (v: string) => void;
  onRegPasswordChange: (v: string) => void;
  onRegConfirmPasswordChange: (v: string) => void;
  onShowPasswordToggle: () => void;
  onMobileAgreedChange: (v: boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
  onSendRegCode: () => void;
  onSwitchToLogin: () => void;
}

export function RegisterForm({
  variant,
  regName,
  regPhone,
  regCode,
  regPassword,
  regConfirmPassword,
  showPassword,
  regCodeSending,
  regCountdown,
  mobileAgreed,
  agreementShake,
  loading,
  onRegNameChange,
  onRegPhoneChange,
  onRegCodeChange,
  onRegPasswordChange,
  onRegConfirmPasswordChange,
  onShowPasswordToggle,
  onMobileAgreedChange,
  onSubmit,
  onSendRegCode,
  onSwitchToLogin,
}: RegisterFormProps) {
  const agreementCheckbox = (
    <m.div
      key={agreementShake}
      initial={{ x: 0 }}
      animate={{ x: [-5, 5, -5, 5, -3, 3, 0] }}
      transition={{ duration: 0.4 }}
    >
      <Checkbox
        id="register-agreement"
        checked={mobileAgreed}
        onChange={onMobileAgreedChange}
        label={
          <span className="text-xs tracking-wide text-brand-charcoal/50">
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
  );

  if (variant === "pc") {
    return (
      <>
        <h1 className="mb-14 text-center text-[2rem] font-light tracking-[0.15em] text-brand-charcoal">
          注册会员
        </h1>
        <form onSubmit={onSubmit} className="space-y-10">
          {/* 姓名后端为 optional，前端不强制必填（与后端对齐） */}
          <input
            type="text"
            value={regName}
            onChange={(e) => onRegNameChange(e.target.value)}
            className={pcInputClass}
            autoComplete="name"
            placeholder="姓名"
          />
          <input
            type="tel"
            required
            value={regPhone}
            onChange={(e) => onRegPhoneChange(e.target.value.replace(/\D/g, "").slice(0, 11))}
            className={pcInputClass}
            maxLength={11}
            autoComplete="tel"
            placeholder="手机号"
          />
          <div className="relative flex gap-3">
            <input
              type="text"
              required
              maxLength={6}
              value={regCode}
              onChange={(e) => onRegCodeChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className={`${pcInputClass} flex-1`}
              autoComplete="one-time-code"
              placeholder="验证码"
            />
            <button
              type="button"
              onClick={onSendRegCode}
              disabled={regCodeSending || regCountdown > 0 || regPhone.length !== 11}
              className="mb-2 shrink-0 self-end border border-brand-charcoal/25 px-4 py-2 text-xs font-light tracking-[0.12em] text-brand-charcoal/60 transition-all hover:bg-brand-charcoal/[0.02] disabled:opacity-30"
            >
              {regCountdown > 0 ? `${regCountdown}s` : "获取"}
            </button>
          </div>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              required
              minLength={PASSWORD_MIN_LENGTH}
              value={regPassword}
              onChange={(e) => onRegPasswordChange(e.target.value)}
              className={`${pcInputClass} pr-10`}
              maxLength={64}
              autoComplete="new-password"
              placeholder="密码（8位且含大写/小写/数字）"
            />
            <button
              type="button"
              onClick={onShowPasswordToggle}
              aria-label={showPassword ? "隐藏密码" : "显示密码"}
              className="absolute right-0 top-1/2 -translate-y-1/2 text-brand-charcoal/40 transition-colors hover:text-brand-charcoal/70"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              required
              minLength={PASSWORD_MIN_LENGTH}
              value={regConfirmPassword}
              onChange={(e) => onRegConfirmPasswordChange(e.target.value)}
              className={`${pcInputClass} pr-10`}
              maxLength={64}
              autoComplete="new-password"
              placeholder="确认密码"
            />
            <button
              type="button"
              onClick={onShowPasswordToggle}
              aria-label={showPassword ? "隐藏密码" : "显示密码"}
              className="absolute right-0 top-1/2 -translate-y-1/2 text-brand-charcoal/40 transition-colors hover:text-brand-charcoal/70"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {agreementCheckbox}
          <div className="pt-4">
            <button type="submit" disabled={loading} className={pcBtnClass}>
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-charcoal/20 border-t-brand-charcoal" />
              ) : (
                "注册"
              )}
            </button>
          </div>
        </form>
        <div className="mt-6 text-center">
          <button
            onClick={onSwitchToLogin}
            className="text-xs tracking-wider text-brand-charcoal/40 transition-colors hover:text-brand-charcoal/70"
          >
            已有账号？返回登录
          </button>
        </div>
      </>
    );
  }

  // Mobile
  return (
    <div className="flex flex-col gap-10">
      <div className="pb-4 pt-[6px] text-center">
        <h2 className="text-[24px] font-light tracking-[0.15em] text-brand-charcoal">注册会员</h2>
        <div className="mx-auto mt-2 w-[70px] border-b border-brand-charcoal" />
      </div>
      <form onSubmit={onSubmit} className="w-full space-y-6">
        <div>
          {/* 姓名后端为 optional，前端不强制必填（与后端对齐） */}
          <input
            type="text"
            value={regName}
            onChange={(e) => onRegNameChange(e.target.value)}
            placeholder="姓名"
            className={mobileInputClass}
          />
        </div>
        <div>
          <input
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="tel"
            required
            value={regPhone}
            onChange={(e) => onRegPhoneChange(e.target.value.replace(/\D/g, "").slice(0, 11))}
            maxLength={11}
            placeholder="手机号"
            className={mobileInputClass}
          />
        </div>
        <div className="relative flex gap-2">
          <input
            type="text"
            required
            maxLength={6}
            value={regCode}
            onChange={(e) => onRegCodeChange(e.target.value)}
            placeholder="验证码"
            autoComplete="one-time-code"
            className={mobileInputFlexClass}
          />
          <button
            type="button"
            onClick={onSendRegCode}
            disabled={regCodeSending || regCountdown > 0 || !regPhone}
            className="mb-2 inline-flex h-12 shrink-0 items-center justify-center self-end border border-brand-charcoal/25 px-3 text-xs font-light tracking-[0.12em] text-brand-charcoal/60 transition-all disabled:opacity-30"
          >
            {regCountdown > 0 ? `${regCountdown}s` : "获取验证码"}
          </button>
        </div>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            required
            minLength={PASSWORD_MIN_LENGTH}
            value={regPassword}
            onChange={(e) => onRegPasswordChange(e.target.value)}
            placeholder="密码（8位且含大写/小写/数字）"
            maxLength={64}
            className={`${mobileInputClass} pr-10`}
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
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            required
            minLength={PASSWORD_MIN_LENGTH}
            value={regConfirmPassword}
            onChange={(e) => onRegConfirmPasswordChange(e.target.value)}
            placeholder="确认密码"
            maxLength={64}
            className={`${mobileInputClass} pr-10`}
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
        {agreementCheckbox}
        <div className="pt-2">
          <button type="submit" disabled={loading} className={mobileBtnClass}>
            <span className="relative z-10 flex items-center justify-center gap-2">
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-charcoal/20 border-t-brand-charcoal" />
              ) : (
                "立即注册"
              )}
            </span>
          </button>
        </div>
      </form>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="inline-flex h-7 min-h-0 items-center justify-center text-xs tracking-wide text-brand-charcoal/40 transition-colors hover:text-brand-charcoal/70"
        >
          已有账户？返回登录
        </button>
      </div>
    </div>
  );
}
