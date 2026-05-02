"use client";

import { useState, FormEvent, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui";
import {
  Eye,
  EyeOff,
  ArrowLeft,
  Mail,
  Lock,
  AlertCircle,
  LogIn,
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
          <OrbitalIcons className="min-h-[500px] min-w-[340px] sm:min-h-[660px] sm:min-w-[660px]">
            <div className="w-[300px] rounded-2xl border border-brand-beige bg-white/80 p-8 shadow-xl shadow-brand-charcoal/5 backdrop-blur-sm sm:w-[340px]">
              {/* Logo */}
              <div className="mb-6 flex flex-col items-center">
                <div className="relative h-[40px] w-[160px]">
                  <Image
                    src="/images/NIHPLOD-logo.svg"
                    alt="NIHPLOD"
                    fill
                    className="object-contain"
                    priority
                  />
                </div>
                <p className="mt-3 text-sm font-bold tracking-[0.15em] text-brand-charcoal/50">
                  管理后台
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {/* 邮箱 */}
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-xs font-medium tracking-wider text-brand-charcoal/60"
                >
                  账号（邮箱）
                </label>
                <div className="relative">
                  <Mail className="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-charcoal/30" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={handleEmailChange}
                    required
                    autoComplete="email"
                    disabled={isLoading}
                    placeholder="请输入邮箱"
                    aria-invalid={!!fieldErrors.email}
                    aria-describedby={fieldErrors.email ? "email-error" : undefined}
                    className={cn(
                      "w-full border-b bg-transparent py-2 pl-7 pr-3 text-sm text-brand-charcoal placeholder:text-brand-charcoal/25 transition-all focus:outline-none disabled:opacity-50",
                      fieldErrors.email
                        ? "border-red-400 focus:border-red-500"
                        : "border-brand-beige focus:border-brand-gold"
                    )}
                  />
                </div>
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
              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-xs font-medium tracking-wider text-brand-charcoal/60 uppercase"
                >
                  密码
                </label>
                <div className="relative">
                  <Lock className="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-charcoal/30" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={handlePasswordChange}
                    required
                    autoComplete="current-password"
                    disabled={isLoading}
                    minLength={6}
                    placeholder="请输入密码"
                    aria-invalid={!!fieldErrors.password}
                    aria-describedby={fieldErrors.password ? "password-error" : undefined}
                    className={cn(
                      "w-full border-b bg-transparent py-2 pl-7 pr-10 text-sm text-brand-charcoal placeholder:text-brand-charcoal/25 transition-all focus:outline-none disabled:opacity-50",
                      fieldErrors.password
                        ? "border-red-400 focus:border-red-500"
                        : "border-brand-beige focus:border-brand-gold"
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-0 top-1/2 -translate-y-1/2 rounded p-1 text-brand-charcoal/30 transition-colors hover:text-brand-charcoal/60 focus:outline-none focus:ring-2 focus:ring-brand-gold/50"
                    tabIndex={-1}
                    aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
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
              <div className="flex items-center">
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={isLoading}
                  className="h-3.5 w-3.5 rounded border-brand-beige text-brand-gold focus:ring-brand-gold/50 disabled:opacity-50"
                />
                <label
                  htmlFor="remember-me"
                  className="ml-2 text-xs text-brand-charcoal/50 select-none"
                >
                  记住账号
                </label>
              </div>

              {/* 错误提示 */}
              {error && (
                <div
                  role="alert"
                  aria-live="polite"
                  className={cn(
                    "flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-600 transition-all duration-300",
                    error ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none h-0 py-0"
                  )}
                >
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* 登录按钮 */}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full bg-brand-charcoal text-white transition-all hover:bg-brand-gold hover:shadow-none disabled:bg-brand-charcoal/50"
                loading={isLoading}
                disabled={isLoading}
                leftIcon={<LogIn className="h-4 w-4" />}
              >
                {isLoading ? "登录中..." : "登录"}
              </Button>
            </form>
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
