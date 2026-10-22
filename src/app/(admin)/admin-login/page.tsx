"use client";

import { useState, FormEvent, useEffect, useCallback, useRef } from "react";
import { useMounted } from "@/hooks/useMounted";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, AlertCircle, ChevronDown, ExternalLink, Lock } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
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
  // 账户锁定/限流冷却倒计时（秒），大于 0 时禁止再次提交
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  // 挂载动画（useMounted 提供 hydration 守卫，避免 effect 内同步 setState）
  const mounted = useMounted();
  const [breadcrumbOpen, setBreadcrumbOpen] = useState(false);
  const breadcrumbRef = useRef<HTMLDivElement>(null);
  const totpInputRef = useRef<HTMLInputElement>(null);

  // 冷却倒计时
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setTimeout(() => {
      setCooldownSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [cooldownSeconds]);

  /** 从服务端错误信息中解析"请 N 分钟后再试"，命中则启动冷却 */
  const startCooldownFromMessage = (message: string) => {
    const match = message.match(/(\d+)\s*分钟后再试/);
    if (match) {
      setCooldownSeconds(Number(match[1]) * 60);
    }
  };

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
        const data = await apiPost<{ totpSetupRequired?: boolean }>("/api/admin/login", {
          email,
          password,
          ...(totpCode ? { totpCode } : {}),
        });
        if (data.totpSetupRequired) {
          window.location.href = "/admin-login/totp-recovery";
          return;
        }
        // 使用 window.location.href 而不用 router.push，确保是 top-level 导航；
        // 浏览器会带上 SameSite=Strict 的 admin_token Cookie，避免 middleware 拦截。
        window.location.href = redirectTo;
      } catch (err) {
        const message = err instanceof Error ? err.message : "网络错误，请检查网络连接";
        // ACCOUNT_LOCKED / 限流时服务端会返回"请 N 分钟后再试"，启动按钮冷却
        startCooldownFromMessage(message);
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
          setError(message);
          requestAnimationFrame(() => totpInputRef.current?.focus());
          return;
        }
        setTotpRequired(false);
        setError(message);
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
      const value = e.target.value.replace(/[^0-9A-Za-z]/g, "").slice(0, 64);
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
            <Input
              id="email"
              label="邮箱地址"
              type="email"
              value={email}
              onChange={handleEmailChange}
              required
              autoComplete="email"
              disabled={isLoading}
              placeholder="name@example.com"
              error={fieldErrors.email}
            />

            <Input
              id="password"
              label="密码"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={handlePasswordChange}
              required
              autoComplete="current-password"
              disabled={isLoading}
              minLength={8}
              placeholder="请输入密码"
              error={fieldErrors.password}
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-brand-charcoal/40 transition-colors hover:bg-brand-charcoal/[0.04] hover:text-brand-charcoal/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
            />

            {totpRequired && (
              <Input
                id="totpCode"
                ref={totpInputRef}
                label="二次验证码 / 恢复码"
                type="text"
                inputMode="text"
                value={totpCode}
                onChange={handleTOTPChange}
                required
                autoComplete="one-time-code"
                disabled={isLoading}
                maxLength={64}
                placeholder="6 位动态验证码、备用码或恢复码"
                error={fieldErrors.totpCode}
                className="tracking-[0.3em] placeholder:tracking-normal"
              />
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
            <Button
              type="submit"
              loading={isLoading}
              disabled={cooldownSeconds > 0}
              className="w-full"
            >
              {isLoading
                ? "登录中..."
                : cooldownSeconds > 0
                  ? `请 ${Math.ceil(cooldownSeconds / 60)} 分钟后再试（${String(Math.floor(cooldownSeconds / 60)).padStart(2, "0")}:${String(cooldownSeconds % 60).padStart(2, "0")}）`
                  : "登录"}
            </Button>

            {/* 找回指引 */}
            <p className="text-center text-xs text-brand-charcoal/40">
              忘记密码或丢失验证器？请联系超级管理员重置
            </p>
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
