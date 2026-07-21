"use client";

import { useState, FormEvent, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, AlertCircle, Loader2, ChevronDown, ExternalLink } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { apiPost, ApiError } from "@/lib/api-client";
import { validatePasswordStrength } from "@/lib/password";
import { OrbitalIcons } from "@/components/ui/OrbitalIcons";

interface FormErrors {
  email?: string;
  password?: string;
  totpCode?: string;
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function LoginPage() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [totpRequired, setTotpRequired] = useState(false);

  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [breadcrumbOpen, setBreadcrumbOpen] = useState(false);
  const breadcrumbRef = useRef<HTMLDivElement>(null);

  // 挂载动画
  useEffect(() => {
    setMounted(true);
  }, []);

  // 面包屑下拉：点击外部关闭 + Escape 关闭
  useEffect(() => {
    if (!breadcrumbOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (breadcrumbRef.current && !breadcrumbRef.current.contains(e.target as Node)) {
        setBreadcrumbOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setBreadcrumbOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [breadcrumbOpen]);

  const validateForm = useCallback((): boolean => {
    const errors: FormErrors = {};

    if (!email.trim()) {
      errors.email = "请输入邮箱地址";
    } else if (!validateEmail(email)) {
      errors.email = "请输入有效的邮箱地址";
    }

    if (!password) {
      errors.password = "请输入密码";
    } else {
      const strength = validatePasswordStrength(password);
      if (!strength.valid) {
        errors.password = strength.message || "密码格式不符合要求";
      }
    }

    if (totpRequired && totpCode.length !== 6) {
      errors.totpCode = "请输入6位二次验证码";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [email, password, totpRequired, totpCode]);

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
        await apiPost("/api/admin/login", {
          email,
          password,
          ...(totpCode ? { totpCode } : {}),
        });
        // 使用 window.location.href 而不是 router.push，确保是 top-level 导航，
        // 浏览器会带上 SameSite=Strict 的 admin_token Cookie，避免 middleware 拦截。
        window.location.href = redirectTo;
      } catch (err) {
        if (err instanceof ApiError && err.code === "TOTP_REQUIRED") {
          setTotpRequired(true);
          setError("请输入二次验证码");
          return;
        }
        setTotpRequired(false);
        setError(err instanceof Error ? err.message : "网络错误，请检查网络连接");
      } finally {
        setIsLoading(false);
      }
    },
    [email, password, totpCode, redirectTo, validateForm]
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

  const handleTOTPChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.replace(/\D/g, "").slice(0, 6);
      setTotpCode(value);
      if (fieldErrors.totpCode) {
        setFieldErrors((prev) => ({ ...prev, totpCode: undefined }));
      }
    },
    [fieldErrors.totpCode]
  );

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-brand-cream px-6">
      {/* 面包屑导航 */}
      <div className="absolute left-6 top-6 z-20 flex items-center gap-2 text-xs text-slate-400 sm:left-10 sm:top-8">
        <Link href="/" className="transition-colors hover:text-slate-600">
          首页
        </Link>
        <span className="text-slate-300">/</span>
        <div className="relative" ref={breadcrumbRef}>
          <button
            onClick={() => setBreadcrumbOpen((v) => !v)}
            className="flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 font-medium text-slate-600 transition-colors hover:text-slate-800"
          >
            后台登录（官网）
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform duration-200",
                breadcrumbOpen && "rotate-180"
              )}
            />
          </button>
          {breadcrumbOpen && (
            <div className="absolute left-0 top-full mt-2 flex -translate-x-[13px] flex-col gap-2 whitespace-nowrap text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span className="select-none text-slate-300">/</span>
                <a
                  href="https://advisor.nihplod.cn/admin"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-slate-600 transition-colors hover:text-slate-800"
                  onClick={() => setBreadcrumbOpen(false)}
                >
                  后台登录（AI 护肤顾问）
                  <ExternalLink className="h-3 w-3 text-slate-400" />
                </a>
              </div>
              <div className="flex items-center gap-2">
                <span className="select-none text-slate-300">/</span>
                <a
                  href="https://ba.nihplod.cn/admin"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-slate-600 transition-colors hover:text-slate-800"
                  onClick={() => setBreadcrumbOpen(false)}
                >
                  后台登录（授权管理）
                  <ExternalLink className="h-3 w-3 text-slate-400" />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 装饰背景光晕 */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-brand-primary/10 blur-[100px]" />
        <div className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-brand-primary/10 blur-[100px]" />
      </div>

      <div className="relative z-10 flex w-full flex-col items-center">
        {/* 轨道动画 + 登录卡片 */}
        <div
          className={cn(
            "transition-all duration-700",
            mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
          )}
        >
          <OrbitalIcons className="min-h-[620px] min-w-[380px] sm:min-h-[860px] sm:min-w-[860px]">
            <div className="w-[260px] overflow-hidden rounded-[28px] bg-transparent sm:w-[380px]">
              {/* Header */}
              <div className="px-8 pb-5 pt-10 text-center sm:px-10 sm:pb-6 sm:pt-12">
                <div className="relative mx-auto mb-4 h-[34px] w-[140px] sm:mb-5 sm:w-[160px]">
                  <Image
                    src="/images/NIHPLOD-logo.svg"
                    alt="NIHPLOD"
                    fill
                    className="object-contain"
                    priority
                  />
                </div>
                <div className="h-1" />
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
                        "block w-full rounded-xl border bg-slate-50 px-5 py-3.5 text-[13px] text-slate-900 outline-none transition-all duration-300 placeholder:text-slate-300 disabled:opacity-50",
                        fieldErrors.email
                          ? "border-red-300 focus:border-red-400 focus:bg-white focus:ring-4 focus:ring-red-100"
                          : "border-slate-100 focus:border-[#00263E]/40 focus:bg-white focus:ring-4 focus:ring-[#00263E]/15"
                      )}
                    />
                    <p
                      id="email-error"
                      className={cn(
                        "mt-1.5 flex items-center gap-1 text-xs text-red-500 transition-all duration-200",
                        fieldErrors.email
                          ? "translate-y-0 opacity-100"
                          : "pointer-events-none mt-0 h-0 -translate-y-1 opacity-0"
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
                      minLength={8}
                      placeholder="密码"
                      aria-invalid={!!fieldErrors.password}
                      aria-describedby={fieldErrors.password ? "password-error" : undefined}
                      className={cn(
                        "block w-full rounded-xl border bg-slate-50 px-5 py-3.5 pr-10 text-[13px] text-slate-900 outline-none transition-all duration-300 placeholder:text-slate-300 disabled:opacity-50",
                        fieldErrors.password
                          ? "border-red-300 focus:border-red-400 focus:bg-white focus:ring-4 focus:ring-red-100"
                          : "border-slate-100 focus:border-[#00263E]/40 focus:bg-white focus:ring-4 focus:ring-[#00263E]/15"
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition-colors hover:text-slate-600 focus:outline-none"
                      tabIndex={-1}
                      aria-label={showPassword ? "隐藏密码" : "显示密码"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    <p
                      id="password-error"
                      className={cn(
                        "mt-1.5 flex items-center gap-1 text-xs text-red-500 transition-all duration-200",
                        fieldErrors.password
                          ? "translate-y-0 opacity-100"
                          : "pointer-events-none mt-0 h-0 -translate-y-1 opacity-0"
                      )}
                    >
                      <AlertCircle className="h-3 w-3 flex-shrink-0" />
                      <span>{fieldErrors.password || ""}</span>
                    </p>
                  </div>

                  {/* TOTP Code */}
                  {totpRequired && (
                    <div>
                      <input
                        id="totpCode"
                        type="text"
                        inputMode="numeric"
                        value={totpCode}
                        onChange={handleTOTPChange}
                        required
                        autoComplete="one-time-code"
                        disabled={isLoading}
                        maxLength={6}
                        placeholder="二次验证码（6位数字）"
                        aria-invalid={!!fieldErrors.totpCode}
                        aria-describedby={fieldErrors.totpCode ? "totp-error" : undefined}
                        className={cn(
                          "block w-full rounded-xl border bg-slate-50 px-5 py-3.5 text-[13px] text-slate-900 outline-none transition-all duration-300 placeholder:text-slate-300 disabled:opacity-50",
                          fieldErrors.totpCode
                            ? "border-red-300 focus:border-red-400 focus:bg-white focus:ring-4 focus:ring-red-100"
                            : "border-slate-100 focus:border-[#00263E]/40 focus:bg-white focus:ring-4 focus:ring-[#00263E]/15"
                        )}
                      />
                      <p
                        id="totp-error"
                        className={cn(
                          "mt-1.5 flex items-center gap-1 text-xs text-red-500 transition-all duration-200",
                          fieldErrors.totpCode
                            ? "translate-y-0 opacity-100"
                            : "pointer-events-none mt-0 h-0 -translate-y-1 opacity-0"
                        )}
                      >
                        <AlertCircle className="h-3 w-3 flex-shrink-0" />
                        <span>{fieldErrors.totpCode || ""}</span>
                      </p>
                    </div>
                  )}

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
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#4A6272]/40 bg-[#4A6272]/10 py-3.5 text-[13px] font-bold tracking-widest text-[#4A6272] transition-all duration-300 hover:border-[#4A6272]/70 hover:bg-[#4A6272]/20 disabled:cursor-not-allowed disabled:opacity-50"
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
      </div>

      {/* 页脚 */}
      <div className="absolute bottom-6 left-0 right-0 z-20 flex flex-col items-center gap-1 px-6">
        <p className="text-[10px] font-light tracking-widest text-brand-charcoal/40">
          &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
        </p>
        <div className="flex items-center justify-center gap-2 whitespace-nowrap text-[9px] font-light tracking-normal text-brand-charcoal/40">
          <Link
            href="https://beian.miit.gov.cn/"
            target="_blank"
            className="transition-colors hover:text-brand-primary"
          >
            沪ICP备2026014764号-1
          </Link>
          <span className="text-brand-charcoal/20">|</span>
          <Link
            href="http://www.beian.gov.cn/portal/registerSystemInfo"
            target="_blank"
            className="flex items-center gap-1 transition-colors hover:text-brand-primary"
          >
            <Image
              src="/images/beian.webp"
              alt="备案图标"
              width={12}
              height={12}
              className="shrink-0 opacity-60"
            />
            <span>沪公网安备31010702010178号</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
