"use client";

import { useState } from "react";
import Image from "next/image";
import {
  ShieldAlert,
  KeyRound,
  Eye,
  EyeOff,
  Copy,
  Check,
  RefreshCw,
  Loader2,
  QrCode,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { apiGet, ApiError } from "@/lib/api-client";
import { useTotpConfirm, isTotpRequired } from "@/hooks/useTotpConfirm";
import { cn } from "@/lib/utils";

interface BreakGlassData {
  configured: boolean;
  username?: string;
  password?: string;
  totpSecret?: string;
  otpauthUrl?: string;
  qrCode?: string;
}

export function BreakGlassCard() {
  const { success, error: toastError } = useToast();
  const { requireTotp, totpModal } = useTotpConfirm();
  const [data, setData] = useState<BreakGlassData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showTotp, setShowTotp] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const submit = () => apiGet<BreakGlassData>("/api/admin/break-glass");
      let result: BreakGlassData;
      try {
        result = await submit();
      } catch (err) {
        if (!isTotpRequired(err)) throw err;
        const verified = await requireTotp(err instanceof ApiError ? err.code : undefined);
        if (!verified) return;
        result = await submit();
      }
      setData(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "加载应急账号信息失败");
    } finally {
      setLoading(false);
    }
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
      success("已复制");
    } catch {
      toastError("复制失败，请手动选择复制");
    }
  };

  const renderCopyButton = (text: string, label: string) => (
    <button
      type="button"
      onClick={() => copy(text, label)}
      className="rounded p-1 text-brand-charcoal/40 transition-colors hover:text-brand-charcoal"
      aria-label={`复制${label}`}
    >
      {copied === label ? (
        <Check className="h-3.5 w-3.5 text-emerald-600" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-amber-100 p-2">
            <ShieldAlert className="h-5 w-5 text-amber-700" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-amber-900">
                测肤子站应急账号（break-glass）
              </h2>
              <Badge variant="warning">仅 owner 可见</Badge>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-amber-800/80">
              仅用于主站管理员 SSO 不可用时的应急登录。查看操作会写入审计日志。 子站平时应保持{" "}
              <code>ADMIN_BREAK_GLASS_ENABLED=false</code>。
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          leftIcon={
            loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : data ? (
              <RefreshCw className="h-4 w-4" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )
          }
          onClick={load}
          disabled={loading}
        >
          {data ? "刷新" : "查看应急账号信息"}
        </Button>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      {data && !data.configured && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-amber-800">
          主站尚未配置 <code>ADVISOR_BREAK_GLASS_USERNAME</code> /
          <code>ADVISOR_BREAK_GLASS_PASSWORD</code> /<code>ADVISOR_BREAK_GLASS_TOTP_SECRET</code>。
        </p>
      )}

      {data?.configured && (
        <div className="mt-4 space-y-3 rounded-xl border border-amber-200/70 bg-white p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-brand-charcoal/40">
                用户名
              </p>
              <div className="mt-1 flex items-center gap-2">
                <code className="break-all text-sm text-brand-charcoal">{data.username}</code>
                {renderCopyButton(data.username || "", "用户名")}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-brand-charcoal/40">
                密码
              </p>
              <div className="mt-1 flex items-center gap-2">
                <code
                  className={cn(
                    "break-all text-sm text-brand-charcoal",
                    !showPassword && "tracking-widest"
                  )}
                >
                  {showPassword ? data.password : "••••••••••••"}
                </code>
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="rounded p-1 text-brand-charcoal/40 transition-colors hover:text-brand-charcoal"
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                >
                  {showPassword ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
                {renderCopyButton(data.password || "", "密码")}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-brand-charcoal/40">
                TOTP Secret
              </p>
              <div className="mt-1 flex items-center gap-2">
                <code
                  className={cn(
                    "break-all text-sm text-brand-charcoal",
                    !showTotp && "tracking-widest"
                  )}
                >
                  {showTotp ? data.totpSecret : "••••••••••••••••"}
                </code>
                <button
                  type="button"
                  onClick={() => setShowTotp((v) => !v)}
                  className="rounded p-1 text-brand-charcoal/40 transition-colors hover:text-brand-charcoal"
                  aria-label={showTotp ? "隐藏 TOTP Secret" : "显示 TOTP Secret"}
                >
                  {showTotp ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                {renderCopyButton(data.totpSecret || "", "TOTP Secret")}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-brand-charcoal/40">
                otpauth 链接
              </p>
              <div className="mt-1 flex items-center gap-2">
                <code className="break-all text-xs text-brand-charcoal/70">{data.otpauthUrl}</code>
                {renderCopyButton(data.otpauthUrl || "", "otpauth 链接")}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-100 pt-4">
            <div>
              <p className="text-sm font-medium text-brand-charcoal">应急账号二维码</p>
              <p className="mt-0.5 text-[11px] text-amber-800/80">
                二维码包含 otpauth 链接与 TOTP Secret，仅 owner 可见，请勿截图外传。
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowQr((v) => !v)}
              disabled={!data.qrCode}
              aria-expanded={showQr}
              leftIcon={showQr ? <EyeOff className="h-4 w-4" /> : <QrCode className="h-4 w-4" />}
            >
              {showQr ? "隐藏二维码" : "显示二维码"}
            </Button>
          </div>

          {showQr && data.qrCode && (
            <div className="flex justify-center rounded-xl border border-amber-200 bg-white p-4">
              <Image
                src={data.qrCode}
                alt="应急账号 TOTP 二维码"
                width={220}
                height={220}
                unoptimized
              />
            </div>
          )}

          {showQr && !data.qrCode && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              二维码生成失败，请使用上方的 otpauth 链接手动导入。
            </p>
          )}

          <p className="border-t border-amber-100 pt-3 text-[11px] leading-relaxed text-amber-800/80">
            请勿截图或外传。轮换应急凭据后，请同步更新主站
            <code> ADVISOR_BREAK_GLASS_* </code>
            环境变量并重启主站。
          </p>
        </div>
      )}

      {totpModal}
    </div>
  );
}
