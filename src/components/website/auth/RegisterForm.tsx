"use client";

import { m } from "framer-motion";
import { Eye, EyeOff, Check } from "lucide-react";
import { pcInputClass, pcBtnClass, mobileInputClass, mobileInputFlexClass, mobileBtnClass } from "./auth-styles";
import { PASSWORD_MIN_LENGTH } from "./auth-utils";

export interface RegisterFormProps {
  variant: "pc" | "mobile";
  inviteCode: string;
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
  onInviteCodeChange: (v: string) => void;
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
  inviteCode,
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
  onInviteCodeChange,
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
  const hasInvite = Boolean(inviteCode);

  const agreementCheckbox = (
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
            disabled={variant === "pc" ? !hasInvite : undefined}
            checked={mobileAgreed}
            onChange={(e) => onMobileAgreedChange(e.target.checked)}
            className="peer sr-only"
          />
          <div className={`h-4 w-4 rounded border border-brand-charcoal/25 bg-transparent transition-all peer-checked:border-brand-charcoal/50 peer-checked:bg-brand-charcoal/50 ${variant === "mobile" ? "peer-checked:border-brand-primary peer-checked:bg-brand-primary" : ""}`} />
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

  if (variant === "pc") {
    return (
      <>
        <h1 className="mb-14 text-center text-[2rem] font-light tracking-[0.15em] text-brand-charcoal">
          注册会员
        </h1>
        <form onSubmit={onSubmit} className="space-y-10">
          <input type="text" required value={inviteCode} onChange={(e) => onInviteCodeChange(e.target.value)} className={pcInputClass} placeholder="邀请码" />
          <input type="text" required disabled={!hasInvite} value={regName} onChange={(e) => onRegNameChange(e.target.value)} className={pcInputClass} placeholder="姓名" />
          <input type="tel" required disabled={!hasInvite} value={regPhone} onChange={(e) => onRegPhoneChange(e.target.value)} className={pcInputClass} maxLength={11} placeholder="手机号" />
          <div className="relative flex gap-3">
            <input type="text" required disabled={!hasInvite} maxLength={6} value={regCode} onChange={(e) => onRegCodeChange(e.target.value)} className={`${pcInputClass} flex-1`} placeholder="验证码" />
            <button type="button" onClick={onSendRegCode} disabled={regCodeSending || regCountdown > 0 || !regPhone || !hasInvite} className="mb-2 shrink-0 self-end border border-brand-charcoal/25 px-4 py-2 text-xs font-light tracking-[0.12em] text-brand-charcoal/60 transition-all hover:bg-brand-charcoal/[0.02] disabled:opacity-30">
              {regCountdown > 0 ? `${regCountdown}s` : "获取"}
            </button>
          </div>
          <div className="relative">
            <input type={showPassword ? "text" : "password"} required disabled={!hasInvite} minLength={PASSWORD_MIN_LENGTH} value={regPassword} onChange={(e) => onRegPasswordChange(e.target.value)} className={`${pcInputClass} pr-10`} maxLength={64} placeholder="密码（8位且含大写/小写/数字）" />
            <button type="button" disabled={!hasInvite} onClick={onShowPasswordToggle} className="absolute right-0 top-1/2 -translate-y-1/2 text-brand-charcoal/40 transition-colors hover:text-brand-charcoal/70">
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div className="relative">
            <input type={showPassword ? "text" : "password"} required disabled={!hasInvite} minLength={PASSWORD_MIN_LENGTH} value={regConfirmPassword} onChange={(e) => onRegConfirmPasswordChange(e.target.value)} className={`${pcInputClass} pr-10`} maxLength={64} placeholder="确认密码" />
            <button type="button" disabled={!hasInvite} onClick={onShowPasswordToggle} className="absolute right-0 top-1/2 -translate-y-1/2 text-brand-charcoal/40 transition-colors hover:text-brand-charcoal/70">
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {agreementCheckbox}
          <div className="pt-4">
            <button type="submit" disabled={loading || !mobileAgreed || !hasInvite} className={pcBtnClass}>
              {loading ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-charcoal/20 border-t-brand-charcoal" /> : "注册"}
            </button>
          </div>
        </form>
        <div className="mt-6 text-center">
          <button onClick={onSwitchToLogin} className="text-xs tracking-wider text-brand-charcoal/40 transition-colors hover:text-brand-charcoal/70">
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
        <div><input type="text" required value={inviteCode} onChange={(e) => onInviteCodeChange(e.target.value)} placeholder="邀请码" className={mobileInputClass} /></div>
        <div><input type="text" required disabled={!hasInvite} value={regName} onChange={(e) => onRegNameChange(e.target.value)} placeholder="姓名" className={mobileInputClass} /></div>
        <div><input type="tel" inputMode="numeric" pattern="[0-9]*" autoComplete="tel" required disabled={!hasInvite} value={regPhone} onChange={(e) => onRegPhoneChange(e.target.value.replace(/\D/g, "").slice(0, 11))} maxLength={11} placeholder="手机号" className={mobileInputClass} /></div>
        <div className="relative flex gap-2">
          <input type="text" required disabled={!hasInvite} maxLength={6} value={regCode} onChange={(e) => onRegCodeChange(e.target.value)} placeholder="验证码" className={mobileInputFlexClass} />
          <button type="button" onClick={onSendRegCode} disabled={regCodeSending || regCountdown > 0 || !regPhone || !hasInvite} className="mb-2 inline-flex h-12 shrink-0 items-center justify-center self-end border border-brand-charcoal/25 px-3 text-xs font-light tracking-[0.12em] text-brand-charcoal/60 transition-all disabled:opacity-30">
            {regCountdown > 0 ? `${regCountdown}s` : "获取验证码"}
          </button>
        </div>
        <div><input type="password" required disabled={!hasInvite} minLength={PASSWORD_MIN_LENGTH} value={regPassword} onChange={(e) => onRegPasswordChange(e.target.value)} placeholder="密码（8位且含大写/小写/数字）" maxLength={64} className={mobileInputClass} /></div>
        <div><input type="password" required disabled={!hasInvite} minLength={PASSWORD_MIN_LENGTH} value={regConfirmPassword} onChange={(e) => onRegConfirmPasswordChange(e.target.value)} placeholder="确认密码" maxLength={64} className={mobileInputClass} /></div>
        {agreementCheckbox}
        <div className="pt-2">
          <button type="submit" disabled={loading || !mobileAgreed || !hasInvite} className={mobileBtnClass}>
            <span className="relative z-10 flex items-center justify-center gap-2">
              {loading ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-charcoal/20 border-t-brand-charcoal" /> : "立即注册"}
            </span>
          </button>
        </div>
      </form>
      <div className="flex flex-col gap-1">
        <button type="button" onClick={onSwitchToLogin} className="inline-flex h-7 min-h-0 items-center justify-center text-xs tracking-wide text-brand-charcoal/40 transition-colors hover:text-brand-charcoal/70">
          已有账户？返回登录
        </button>
      </div>
    </div>
  );
}
