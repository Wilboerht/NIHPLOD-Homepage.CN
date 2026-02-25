"use client";

import { useState, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui";
import { Input } from "@/components/ui";

import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
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

      // 登录成功，跳转到管理后台
      router.push(redirectTo);
      router.refresh();
    } catch {
      setError("网络错误，请检查网络连接");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-cream px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center justify-center">
          <Image
            src="/images/logo.webp"
            alt="NIHPLOD Logo"
            width={240}
            height={60}
            className="h-auto w-48 object-contain"
            priority
          />
        </div>

        {/* 登录卡片 */}
        <div className="rounded-2xl bg-white p-8 shadow-lg">
          <h2 className="mb-6 text-center font-serif text-xl text-brand-charcoal">管理员登录</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* 错误提示 */}
            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-center text-sm text-red-600">
                {error}
              </div>
            )}

            {/* 邮箱输入 */}
            <Input
              id="email"
              type="email"
              label="邮箱地址"
              placeholder="admin@nihplod.cn"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={isLoading}
            />

            {/* 密码输入 */}
            <Input
              id="password"
              type="password"
              label="密码"
              placeholder="请输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              disabled={isLoading}
              minLength={6}
            />

            {/* 登录按钮 */}
            <Button
              type="submit"
              className="w-full rounded-lg py-3"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="h-4 w-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  登录中...
                </span>
              ) : (
                "登录"
              )}
            </Button>
          </form>

          {/* 提示信息 */}
          <p className="mt-6 text-center text-xs text-brand-charcoal/40">
            默认账号: admin@nihplod.cn / admin123456
          </p>
        </div>

        {/* 返回首页 */}
        <p className="mt-6 text-center text-sm text-brand-charcoal/60">
          <a href="/" className="hover:text-brand-gold transition-colors">
            ← 返回网站首页
          </a>
        </p>
      </div>
    </div>
  );
}
