"use client";

import { useState, FormEvent, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Eye,
  EyeOff,
  ArrowLeft,
  AlertCircle,
  Loader2,
} from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { OrbitalIcons } from "@/components/ui/OrbitalIcons";

const REMEMBER_EMAIL_KEY = "admin_login_email";

interface FormErrors {
  email?: string;
  password?: string;
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mounted, setMounted] = useState(false);

  // 挂载动画 + 恢复记住的邮箱
  useEffect(() => {
    setMounted(true);
    const savedEmail = localStorage.getItem(REMEMBER_EMAIL_KEY);
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const validateForm = useCallback((): boolean => {
    const errors: FormErrors = {};

    if (!email.trim()) {
      errors.email = "请输入邮箱地址";
    } else if (!validateEmail(email)) {
      errors.email = "请输入有效的邮箱地址";
    }

    if (!password) {
      errors.password = "请输入密码";
    } else if (password.length < 6) {
      errors.password = "密码至少需要 6 位";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [email, password]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError("");
      setFieldErrors({});

      if (!validateForm()) {
        return;
      }

      setIsLoading(true);

      try {
        const response = await fetch("/api/admin/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          setError(data.error?.message || "登录失败，请稍后重试");
          return;
        }

        // 记住邮箱
        if (rememberMe) {
          localStorage.setItem(REMEMBER_EMAIL_KEY, email);
        } else {
          localStorage.removeItem(REMEMBER_EMAIL_KEY);
        }

        router.push(redirectTo);
        router.refresh();
      } catch {
        setError("网络错误，请检查网络连接");
      } finally {
        setIsLoading(false);
      }
    },
    [email, password, rememberMe, redirectTo, router, validateForm]
  );

  const handleEmailChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setEmail(e.target.value);
      if (fieldErrors.email) {
        setFieldErrors((prev) => ({ ...prev, email: undefined }));
      }
    },
    [fieldErrors.email]
  );

  const handlePasswordChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPassword(e.target.value);
      if (fieldErrors.password) {
        setFieldErrors((prev) => ({ ...prev, password: undefined }));
      }
    },
    [fieldErrors.password]
  );

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-cream px-6">
      {/* 装饰背景光晕 */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-brand-gold/10 blur-[100px]" />
        <div className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-brand-gold/10 blur-[100px]" />
      </div>

      <div className="relative z-10 flex w-full flex-col items-center">
        {/* 轨道动画 + 登录卡片 */}
        <div
          className={cn(
            "transition-all duration-700",
            mounted
              ? "translate-y-0 opacity-100"
              : "translate-y-4 opacity-0"
          )}
        >
          <OrbitalIcons className="min-h-[580px] min-w-[360px] sm:min-h-[800px] sm:min-w-[800px]">
            <div className="w-[280px] overflow-hidden rounded-[28px] bg-white shadow-[0_45px_80px_-16px_rgba(0,0,0,0.15)] sm:w-[400px]">
              {/* Header */}
              <div className="px-8 pb-8 pt-12 text-center sm:px-10 sm:pb-10 sm:pt-14">
                <div className="relative mx-auto mb-6 h-[34px] w-[140px] sm:mb-7 sm:w-[160px]">
                  <Image
                    src="/images/NIHPLOD-logo.svg"
                    alt="NIHPLOD"
                    fill
                    className="object-contain"
                    priority
                  />
                </div>
                <h2 className="text-lg font-bold tracking-[0.14em] text-slate-900 sm:text-xl">
                  后台登录
                </h2>
              </div>

              {/* 表单区域 */}
              <div className="px-8 pb-10 sm:px-10">
                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                  {/* 邮箱 */}
                  <div>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={handleEmailChange}
                      required
                      autoComplete="email"
                      disabled={isLoading}
                      placeholder="邮箱地址"
                      aria-invalid={!!fieldErrors.email}
                      aria-describedby={fieldErrors.email ? "email-error" : undefined}
                      className={cn(
                        "block w-full rounded-xl border bg-slate-50 py-3.5 px-5 text-[13px] text-slate-900 outline-none transition-all duration-300 placeholder:text-slate-300 disabled:opacity-50",
                        fieldErrors.email
                          ? "border-red-300 focus:border-red-400 focus:bg-white focus:ring-4 focus:ring-red-100"
                          : "border-slate-100 focus:border-[#C6A87C]/40 focus:bg-white focus:ring-4 focus:ring-[#C6A87C]/15"
                      )}
                    />
                    <p
                      id="email-error"
                      className={cn(
                        "mt-1.5 flex items-center gap-1 text-xs text-red-500 transition-all duration-200",
                        fieldErrors.email ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1 pointer-events-none h-0 mt-0"
                      )}
                    >
                      <AlertCircle className="h-3 w-3 flex-shrink-0" />
                      <span>{fieldErrors.email || ""}</span>
                    </p>
                  </div>

                  {/* 密码 */}
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={handlePasswordChange}
                      required
                      autoComplete="current-password"
                      disabled={isLoading}
                      minLength={6}
                      placeholder="密码"
                      aria-invalid={!!fieldErrors.password}
                      aria-describedby={fieldErrors.password ? "password-error" : undefined}
                      className={cn(
                        "block w-full rounded-xl border bg-slate-50 py-3.5 px-5 pr-10 text-[13px] text-slate-900 outline-none transition-all duration-300 placeholder:text-slate-300 disabled:opacity-50",
                        fieldErrors.password
                          ? "border-red-300 focus:border-red-400 focus:bg-white focus:ring-4 focus:ring-red-100"
                          : "border-slate-100 focus:border-[#C6A87C]/40 focus:bg-white focus:ring-4 focus:ring-[#C6A87C]/15"
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition-colors hover:text-slate-600 focus:outline-none"
                      tabIndex={-1}
                      aria-label={showPassword ? "隐藏密码" : "显示密码"}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                    <p
                      id="password-error"
                      className={cn(
                        "mt-1.5 flex items-center gap-1 text-xs text-red-500 transition-all duration-200",
                        fieldErrors.password ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1 pointer-events-none h-0 mt-0"
                      )}
                    >
                      <AlertCircle className="h-3 w-3 flex-shrink-0" />
                      <span>{fieldErrors.password || ""}</span>
                    </p>
                  </div>

                  {/* 记住我 */}
                  <div className="flex items-center pt-1">
                    <input
                      id="remember-me"
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      disabled={isLoading}
                      className="h-4 w-4 rounded border-slate-200 text-[#8B7355] focus:ring-[#8B7355]/30"
                    />
                    <label
                      htmlFor="remember-me"
                      className="ml-2 text-[13px] text-slate-500 select-none"
                    >
                      记住账号
                    </label>
                  </div>

                  {/* 错误提示 */}
                  {error && (
                    <div
                      role="alert"
                      aria-live="polite"
                      className="flex items-center gap-2 rounded-full border border-slate-100 bg-white px-5 py-3 text-xs font-bold tracking-widest text-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.08)]"
                    >
                      <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 text-red-500" />
                      <span>{error}</span>
                    </div>
                  )}

                  {/* 登录按钮 */}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#8B7355]/40 bg-[#8B7355]/10 py-3.5 text-[13px] font-bold tracking-widest text-[#8B7355] transition-all duration-300 hover:border-[#8B7355]/70 hover:bg-[#8B7355]/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        登录中...
                      </>
                    ) : (
                      "登 录"
                    )}
                  </button>
                </form>
              </div>
            </div>
          </OrbitalIcons>
        </div>

        {/* 返回首页 */}
        <div
          className={cn(
            "mt-10 text-center transition-all duration-700 delay-300",
            mounted
              ? "translate-y-0 opacity-100"
              : "translate-y-4 opacity-0"
          )}
        >
          <a
            href="/"
            className="inline-flex items-center gap-2 text-xs tracking-wider text-brand-charcoal/30 transition-colors hover:text-brand-charcoal/60"
          >
            <ArrowLeft className="h-3 w-3" />
            返回网站
          </a>
        </div>
      </div>
    </div>
  );
}
