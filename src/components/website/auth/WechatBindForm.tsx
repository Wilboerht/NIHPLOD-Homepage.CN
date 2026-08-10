"use client";

import { Eye, EyeOff, CheckCircle } from "lucide-react";
import {
  pcInputClass,
  pcBtnClass,
  mobileInputClass,
  mobileInputFlexClass,
  mobileBtnClass,
} from "./auth-styles";
import { PASSWORD_MIN_LENGTH } from "./auth-utils";

export interface WechatBindFormProps {
  variant: "pc" | "mobile";
  regPhone: string;
  regCode: string;
  regPassword: string;
  showPassword: boolean;
  regCodeSending: boolean;
  regCountdown: number;
  loading: boolean;
  onRegPhoneChange: (v: string) => void;
  onRegCodeChange: (v: string) => void;
  onRegPasswordChange: (v: string) => void;
  onShowPasswordToggle: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onSendRegCode: () => void;
}

export function WechatBindForm({
  variant,
  regPhone,
  regCode,
  regPassword,
  showPassword,
  regCodeSending,
  regCountdown,
  loading,
  onRegPhoneChange,
  onRegCodeChange,
  onRegPasswordChange,
  onShowPasswordToggle,
  onSubmit,
  onSendRegCode,
}: WechatBindFormProps) {
  if (variant === "pc") {
    return (
      <>
        <h1 className="mb-10 text-center text-[2rem] font-light tracking-[0.15em] text-brand-charcoal">
          绑定手机号
        </h1>
        <p className="mb-10 text-center text-sm tracking-wide text-brand-charcoal/50">
          微信授权成功，请绑定手机号以完成登录。
        </p>
        <form onSubmit={onSubmit} className="space-y-8">
          <input
            type="tel"
            required
            value={regPhone}
            onChange={(e) => onRegPhoneChange(e.target.value)}
            className={pcInputClass}
            maxLength={11}
            placeholder="手机号"
          />
          <div className="relative flex gap-3">
            <input
              type="text"
              required
              maxLength={6}
              value={regCode}
              onChange={(e) => onRegCodeChange(e.target.value)}
              className={`${pcInputClass} flex-1`}
              placeholder="验证码"
            />
            <button
              type="button"
              onClick={onSendRegCode}
              disabled={regCodeSending || regCountdown > 0 || !regPhone}
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
              placeholder="密码（8位且含大写/小写/数字）"
            />
            <button
              type="button"
              onClick={onShowPasswordToggle}
              className="absolute right-0 top-1/2 -translate-y-1/2 text-brand-charcoal/40 transition-colors hover:text-brand-charcoal/70"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <button type="submit" disabled={loading} className={pcBtnClass}>
            {loading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-charcoal/20 border-t-brand-charcoal" />
            ) : (
              <>
                <span>绑定手机号</span> <CheckCircle size={16} />
              </>
            )}
          </button>
        </form>
      </>
    );
  }

  // Mobile
  return (
    <div className="flex flex-col gap-12">
      <div className="pb-4 pt-[6px] text-center">
        <h2 className="text-[24px] font-light tracking-[0.15em] text-brand-charcoal">绑定手机号</h2>
        <div className="mx-auto mt-2 w-[70px] border-b border-brand-charcoal" />
        <p className="mt-4 text-sm tracking-wide text-brand-charcoal/50">
          微信授权成功，请绑定手机号以完成登录。
        </p>
      </div>
      <form onSubmit={onSubmit} className="w-full space-y-6">
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
            onChange={(e) => onRegCodeChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="验证码"
            className={mobileInputFlexClass}
          />
          <button
            type="button"
            onClick={onSendRegCode}
            disabled={regCodeSending || regCountdown > 0 || regPhone.length !== 11}
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
            className="absolute right-0 top-1/2 -translate-y-1/2 text-brand-charcoal/40 transition-colors hover:text-brand-charcoal/70"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <div className="pt-2">
          <button type="submit" disabled={loading} className={mobileBtnClass}>
            <span className="relative z-10 flex items-center justify-center gap-2">
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-charcoal/20 border-t-brand-charcoal" />
              ) : (
                <>绑定手机号</>
              )}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}
