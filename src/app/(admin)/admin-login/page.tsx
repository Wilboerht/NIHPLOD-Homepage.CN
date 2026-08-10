"use client";

import { useState, FormEvent, useEffect, useCallback, useRef } from "react";
import { useMounted } from "@/hooks/useMounted";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, AlertCircle, Loader2, ChevronDown, ExternalLink } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { apiPost, ApiError } from "@/lib/api-client";

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
  const rawRedirect = searchParams.get("redirect");
  const redirectTo =
    rawRedirect && (rawRedirect.startsWith("/admin") || rawRedirect === "/")
      ? rawRedirect
      : "/admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [totpRequired, setTotpRequired] = useState(false);

  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // 挂载动画（useMounted 提供 hydration 守卫，避免 effect 内同步 setState）
  const mounted = useMounted();
  const [breadcrumbOpen, setBreadcrumbOpen] = useState(false);
  const breadcrumbRef = useRef<HTMLDivElement>(null);
  const formTouched = email || password || (totpRequired && totpCode);

  // 防止意外离开导致表单数据丢失
  useEffect(() => {
    if (!formTouched) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [formTouched]);

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
    <div className="flex min-h-dvh flex-col bg-[#fefcf8]">
      {/* 面包屑导航 */}
      <div className="flex items-center gap-2 px-6 py-5 text-xs text-brand-charcoal/40 sm:px-10">
        <Link href="/" className="transition-colors hover:text-brand-charcoal/70">
          首页
        </Link>
        <span className="text-brand-charcoal/25">/</span>
        <div className="relative" ref={breadcrumbRef}>
          <button
            onClick={() => setBreadcrumbOpen((v) => !v)}
            className="flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 font-medium text-brand-charcoal/60 transition-colors hover:text-brand-charcoal"
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
            <div className="border-brand-charcoal/8 absolute left-0 top-full z-30 mt-2 flex -translate-x-[13px] flex-col gap-2 whitespace-nowrap rounded-xl border bg-white p-3 text-xs shadow-lg">
              <div className="flex items-center gap-2">
                <span className="select-none text-brand-charcoal/25">/</span>
                <a
                  href="https://advisor.nihplod.cn/admin"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-brand-charcoal/60 transition-colors hover:text-brand-primary"
                  onClick={() => setBreadcrumbOpen(false)}
                >
                  后台登录（AI 护肤顾问）
                  <ExternalLink className="h-3 w-3 text-brand-charcoal/40" />
                </a>
              </div>
              <div className="flex items-center gap-2">
                <span className="select-none text-brand-charcoal/25">/</span>
                <a
                  href="https://ba.nihplod.cn/admin"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-brand-charcoal/60 transition-colors hover:text-brand-primary"
                  onClick={() => setBreadcrumbOpen(false)}
                >
                  后台登录（授权管理）
                  <ExternalLink className="h-3 w-3 text-brand-charcoal/40" />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 主体：左右分栏 */}
      <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-8 lg:px-12">
        <div
          className={cn(
            "flex w-full max-w-5xl overflow-hidden rounded-3xl shadow-2xl shadow-brand-charcoal/[0.06] transition-all duration-700",
            mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
          )}
        >
          {/* 左侧品牌区 */}
          <div
            className="relative hidden w-[44%] flex-col overflow-hidden lg:flex"
            style={{
              backgroundImage: "url(/images/login-background.webp)",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            {/* 品牌色遮罩层 */}
            <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/30 to-brand-primary/50" />
            <div className="relative flex flex-1 flex-col justify-between p-12">
              <div className="relative h-[30px] w-[130px]">
                <Image
                  src="/images/NIHPLOD-logo.svg"
                  alt="NIHPLOD"
                  fill
                  className="object-contain object-left brightness-0 invert"
                  priority
                />
              </div>
              <div className="flex h-11 items-center gap-3 rounded-xl border border-white/[0.12] bg-white/[0.08] px-4 backdrop-blur-sm">
                <span className="text-xs font-light tracking-wider text-white/60">
                  NIHPLOD Admin v2.0.1
                </span>
              </div>
            </div>
          </div>

          {/* 右侧表单区 */}
          <div className="flex w-full flex-col justify-center bg-white px-8 py-12 sm:px-12 lg:w-[56%] lg:px-14">
            {/* 移动端 Logo */}
            <div className="mb-8 lg:hidden">
              <div className="relative h-[28px] w-[120px]">
                <Image
                  src="/images/NIHPLOD-logo.svg"
                  alt="NIHPLOD"
                  fill
                  className="object-contain object-left"
                  priority
                />
              </div>
            </div>

            <h1 className="mb-1 text-xl font-medium tracking-wide text-brand-charcoal">
              管理员登录
            </h1>
            <p className="mb-8 text-sm text-brand-charcoal/50">请输入您的管理账号</p>

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {/* 邮箱 */}
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-xs font-medium tracking-wide text-brand-charcoal/60"
                >
                  邮箱地址
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={handleEmailChange}
                  required
                  autoComplete="email"
                  disabled={isLoading}
                  placeholder="name@example.com"
                  aria-invalid={!!fieldErrors.email}
                  aria-describedby={fieldErrors.email ? "email-error" : undefined}
                  className={cn(
                    "block w-full rounded-xl border bg-brand-charcoal/[0.02] px-4 py-3 text-[15px] text-brand-charcoal outline-none transition-all duration-300 placeholder:text-brand-charcoal/25 disabled:opacity-50",
                    fieldErrors.email
                      ? "border-red-300 focus:border-red-400 focus:bg-white focus:ring-4 focus:ring-red-50"
                      : "border-brand-charcoal/15 focus:border-brand-primary/50 focus:bg-white focus:ring-4 focus:ring-brand-primary/5"
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
              <div>
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-xs font-medium tracking-wide text-brand-charcoal/60"
                >
                  密码
                </label>
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
                    placeholder="请输入密码"
                    aria-invalid={!!fieldErrors.password}
                    aria-describedby={fieldErrors.password ? "password-error" : undefined}
                    className={cn(
                      "block w-full rounded-xl border bg-brand-charcoal/[0.02] px-4 py-3 pr-10 text-[15px] text-brand-charcoal outline-none transition-all duration-300 placeholder:text-brand-charcoal/25 disabled:opacity-50",
                      fieldErrors.password
                        ? "border-red-300 focus:border-red-400 focus:bg-white focus:ring-4 focus:ring-red-50"
                        : "border-brand-charcoal/15 focus:border-brand-primary/50 focus:bg-white focus:ring-4 focus:ring-brand-primary/5"
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-brand-charcoal/30 transition-colors hover:text-brand-charcoal/60 focus:outline-none"
                    tabIndex={-1}
                    aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
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
                  <label
                    htmlFor="totpCode"
                    className="mb-1.5 block text-xs font-medium tracking-wide text-brand-charcoal/60"
                  >
                    二次验证码
                  </label>
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
                    placeholder="6 位数字验证码"
                    aria-invalid={!!fieldErrors.totpCode}
                    aria-describedby={fieldErrors.totpCode ? "totp-error" : undefined}
                    className={cn(
                      "block w-full rounded-xl border bg-brand-charcoal/[0.02] px-4 py-3 text-[15px] tracking-[0.3em] text-brand-charcoal outline-none transition-all duration-300 placeholder:tracking-normal placeholder:text-brand-charcoal/25 disabled:opacity-50",
                      fieldErrors.totpCode
                        ? "border-red-300 focus:border-red-400 focus:bg-white focus:ring-4 focus:ring-red-50"
                        : "border-brand-charcoal/15 focus:border-brand-primary/50 focus:bg-white focus:ring-4 focus:ring-brand-primary/5"
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
                  className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-600"
                >
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* 登录按钮 */}
              <button
                type="submit"
                disabled={isLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-primary bg-transparent py-3 text-[15px] font-medium tracking-wider text-brand-primary transition-all duration-300 hover:bg-brand-primary hover:text-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
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
      </div>

      {/* 页脚 */}
      <footer className="flex flex-col items-center gap-1 px-6 pb-6">
        <p className="text-[11px] font-light tracking-widest text-brand-charcoal/40">
          &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
        </p>
        <div className="flex items-center justify-center gap-2 whitespace-nowrap text-[11px] font-light tracking-normal text-brand-charcoal/40">
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
      </footer>
    </div>
  );
}
