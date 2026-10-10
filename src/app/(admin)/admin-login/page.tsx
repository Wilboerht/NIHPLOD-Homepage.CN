"use client";

import { useState, FormEvent, useEffect, useCallback, useRef } from "react";
import { useMounted } from "@/hooks/useMounted";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, AlertCircle, Loader2, ChevronDown, ExternalLink, Lock } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { apiPost, ApiError, getErrorDataFlag } from "@/lib/api-client";

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
  const totpInputRef = useRef<HTMLInputElement>(null);
  // 登录成功跳转时不再触发离开确认
  const submittedRef = useRef(false);
  const formTouched = email || password || (totpRequired && totpCode);

  // 防止意外离开导致表单数据丢失
  useEffect(() => {
    if (!formTouched) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (submittedRef.current) return;
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

    if (totpRequired && totpCode.trim().length < 6) {
      errors.totpCode = "请输入 6 位动态验证码或备用码";
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
        submittedRef.current = true;
        // 使用 window.location.href 而不是 router.push，确保是 top-level 导航，
        // 浏览器会带上 SameSite=Strict 的 admin_token Cookie，避免 middleware 拦截。
        window.location.href = redirectTo;
      } catch (err) {
        // TOTP_REQUIRED / TOTP_INVALID / TOTP_RATE_LIMITED 均保持验证码输入框展开，
        // 否则用户输错一次就要重填邮箱密码；清空输入并聚焦便于重试。
        const needsTotp =
          err instanceof ApiError &&
          (err.code === "TOTP_REQUIRED" ||
            err.code === "TOTP_INVALID" ||
            err.code === "TOTP_RATE_LIMITED" ||
            getErrorDataFlag(err, "totpRequired"));
        if (needsTotp) {
          setTotpRequired(true);
          setTotpCode("");
          setError(err instanceof Error ? err.message : "请输入二次验证码");
          requestAnimationFrame(() => totpInputRef.current?.focus());
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
      // 允许字母数字：TOTP 为 6 位数字，备用码为 16 位 hex
      const value = e.target.value.replace(/[^0-9A-Za-z]/g, "").slice(0, 20);
      setTotpCode(value);
      if (fieldErrors.totpCode) {
        setFieldErrors((prev) => ({ ...prev, totpCode: undefined }));
      }
    },
    [fieldErrors.totpCode]
  );

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      {/* 主体：居中卡片 */}
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div
          className={cn(
            "flex w-full max-w-sm flex-col gap-6 transition-all duration-700",
            mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
          )}
        >
          {/* 标题区：锁形徽章 + 管理面板 */}
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-brand-charcoal/10 bg-brand-charcoal/[0.04]">
              <Lock className="h-5 w-5 text-brand-charcoal/50" />
            </div>
            <div className="flex flex-col gap-1">
              <h1 className="text-xl font-semibold tracking-tight text-brand-charcoal">管理面板</h1>
              <p className="text-sm text-brand-charcoal/50">请输入您的管理账号</p>
            </div>
          </div>

          {/* 表单卡片 */}
          <form
            onSubmit={handleSubmit}
            noValidate
            className="flex flex-col gap-4 rounded-2xl border border-brand-charcoal/10 bg-white p-6"
          >
            {/* 邮箱 */}
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-brand-charcoal"
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
                  "block w-full rounded-lg border bg-brand-charcoal/[0.03] px-4 py-2 text-sm text-brand-charcoal outline-none transition-colors placeholder:text-brand-charcoal/30 disabled:opacity-50",
                  fieldErrors.email
                    ? "border-red-300 focus:border-red-400 focus:bg-white"
                    : "border-brand-charcoal/15 focus:border-brand-primary/50 focus:bg-white"
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
                className="mb-1.5 block text-sm font-medium text-brand-charcoal"
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
                    "block w-full rounded-lg border bg-brand-charcoal/[0.03] px-4 py-2 pr-10 text-sm text-brand-charcoal outline-none transition-colors placeholder:text-brand-charcoal/30 disabled:opacity-50",
                    fieldErrors.password
                      ? "border-red-300 focus:border-red-400 focus:bg-white"
                      : "border-brand-charcoal/15 focus:border-brand-primary/50 focus:bg-white"
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-brand-charcoal/30 transition-colors hover:text-brand-charcoal/60 focus:outline-none"
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
                  className="mb-1.5 block text-sm font-medium text-brand-charcoal"
                >
                  二次验证码
                </label>
                <input
                  id="totpCode"
                  ref={totpInputRef}
                  type="text"
                  inputMode="text"
                  value={totpCode}
                  onChange={handleTOTPChange}
                  required
                  autoComplete="one-time-code"
                  disabled={isLoading}
                  maxLength={20}
                  placeholder="6 位动态验证码或备用码"
                  aria-invalid={!!fieldErrors.totpCode}
                  aria-describedby={fieldErrors.totpCode ? "totp-error" : undefined}
                  className={cn(
                    "block w-full rounded-lg border bg-brand-charcoal/[0.03] px-4 py-2 text-sm tracking-[0.3em] text-brand-charcoal outline-none transition-colors placeholder:tracking-normal placeholder:text-brand-charcoal/30 disabled:opacity-50",
                    fieldErrors.totpCode
                      ? "border-red-300 focus:border-red-400 focus:bg-white"
                      : "border-brand-charcoal/15 focus:border-brand-primary/50 focus:bg-white"
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
                className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-600"
              >
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* 登录按钮 */}
            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  登录中...
                </>
              ) : (
                "登录"
              )}
            </button>
          </form>

          {/* 子站切换（面包屑下拉） */}
          <div className="flex items-center justify-center gap-2 text-xs text-brand-charcoal/40">
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
                <div className="absolute bottom-full left-1/2 z-30 mb-2 flex -translate-x-1/2 flex-col gap-2 whitespace-nowrap rounded-xl border border-brand-charcoal/10 bg-white p-3 text-xs shadow-lg">
                  <div className="flex items-center gap-2">
                    <span className="select-none text-brand-charcoal/25">/</span>
                    <a
                      href="https://smart.nihplod.cn/admin"
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
        </div>
      </main>

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
