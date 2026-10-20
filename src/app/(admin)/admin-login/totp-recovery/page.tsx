"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AlertCircle, Check, Copy, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiPost, ApiError } from "@/lib/api-client";

interface TOTPSetupData {
  qrCode: string;
  secret: string;
  backupCodes: string[];
}

export default function TOTPRecoveryPage() {
  const startedRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [setupData, setSetupData] = useState<TOTPSetupData | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const start = async () => {
      try {
        const data = await apiPost<TOTPSetupData>("/api/admin/totp/recovery/setup/start", {});
        setSetupData(data);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "恢复会话已过期，请重新登录");
      } finally {
        setLoading(false);
      }
    };

    void start();
  }, []);

  const verify = async () => {
    if (verifyCode.length !== 6) {
      setError("请输入 6 位验证码");
      return;
    }

    setProcessing(true);
    setError("");
    try {
      await apiPost("/api/admin/totp/recovery/setup/verify", { code: verifyCode });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "验证失败，请重试");
    } finally {
      setProcessing(false);
    }
  };

  const copySecret = async () => {
    if (!setupData) return;
    await navigator.clipboard.writeText(setupData.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-white px-4 py-8">
      <div className="w-full max-w-lg rounded-2xl border border-brand-charcoal/10 bg-white p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-charcoal/[0.04]">
            <ShieldCheck className="h-5 w-5 text-brand-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-brand-charcoal">重新绑定二次验证</h1>
            <p className="text-xs text-brand-charcoal/50">
              使用恢复码登录成功，请绑定新的验证器后重新登录。
            </p>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-brand-primary" />
          </div>
        )}

        {!loading && error && !setupData && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <Link href="/admin-login" className="text-sm text-brand-primary hover:underline">
              返回管理员登录
            </Link>
          </div>
        )}

        {done && (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              二次验证已重新启用。请使用新验证器重新登录。
            </div>
            <Link
              href="/admin-login"
              className="inline-flex rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white"
            >
              返回登录
            </Link>
          </div>
        )}

        {!loading && setupData && !done && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 rounded-xl border border-brand-charcoal/10 p-4">
              <Image
                src={setupData.qrCode}
                alt="TOTP 二维码"
                width={220}
                height={220}
                unoptimized
              />
              <div className="flex w-full items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded bg-brand-charcoal/[0.04] px-2 py-1.5 text-xs">
                  {setupData.secret}
                </code>
                <Button type="button" size="sm" variant="outline" onClick={copySecret}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-brand-charcoal/60">备用码（请保存）</p>
              <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-brand-charcoal/[0.03] p-3 text-xs">
                {setupData.backupCodes.map((code) => (
                  <code key={code}>{code}</code>
                ))}
              </div>
            </div>

            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  label="输入新验证器上的 6 位验证码"
                  inputMode="numeric"
                  maxLength={6}
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                />
              </div>
              <Button
                type="button"
                onClick={verify}
                loading={processing}
                disabled={processing || verifyCode.length !== 6}
              >
                确认启用
              </Button>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
