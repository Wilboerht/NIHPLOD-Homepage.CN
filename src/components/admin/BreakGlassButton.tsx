"use client";

import { useState } from "react";
import Image from "next/image";
import { AlertTriangle, Eye, EyeOff, Copy, Check, RefreshCw, Loader2, QrCode } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
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

/**
 * 管理员标题旁的测肤子站应急账号入口。
 * 平时只显示感叹号，点击打开模态框并加载 break-glass 响应。
 */
export function BreakGlassButton() {
  const { success, error: toastError } = useToast();
  const { requireTotp, totpModal } = useTotpConfirm();
  const [open, setOpen] = useState(false);
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
        if (!verified) {
          setError("需要完成二次验证后才能查看应急账号。");
          return;
        }
        result = await submit();
      }
      setData(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "获取响应内容失败");
    } finally {
      setLoading(false);
    }
  };

  const openDialog = () => {
    setOpen(true);
    void load();
  };

  const closeDialog = () => {
    setOpen(false);
    setData(null);
    setError(null);
    setShowPassword(false);
    setShowTotp(false);
    setShowQr(false);
    setCopied(null);
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
      className="rounded p-1 text-brand-charcoal/65 transition-colors hover:text-brand-charcoal"
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
    <>
      <button
        type="button"
        onClick={openDialog}
        className="rounded-full p-1 text-amber-600 transition-colors hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
        aria-label="查看测肤子站应急账号（break-glass）"
        title="查看测肤子站应急账号（break-glass）"
      >
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
      </button>

      <Modal
        open={open}
        onClose={closeDialog}
        size="lg"
        title="测肤子站应急账号（break-glass）"
        description="用于测肤子站管理员 SSO 不可用时的应急登录。仅 owner 可见，查看会写入审计日志。"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={closeDialog}>
              关闭
            </Button>
            <Button
              variant="outline"
              leftIcon={
                loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )
              }
              onClick={load}
              disabled={loading}
            >
              刷新响应
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="warning">仅 owner 可见</Badge>
            <span className="text-xs text-brand-charcoal/65">测肤子站 SSO 应急登录</span>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading && !data && (
            <div className="flex items-center justify-center rounded-xl border border-brand-charcoal/10 py-12">
              <Loader2 className="h-6 w-6 animate-spin text-brand-charcoal/65" />
            </div>
          )}

          {data && !data.configured && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              测肤子站尚未配置 <code>ADVISOR_BREAK_GLASS_USERNAME</code> /
              <code>ADVISOR_BREAK_GLASS_PASSWORD</code> /
              <code>ADVISOR_BREAK_GLASS_TOTP_SECRET</code>。
            </div>
          )}

          {data?.configured && (
            <div className="space-y-4 rounded-xl border border-brand-charcoal/10 bg-white p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-brand-charcoal/65">
                    用户名
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="break-all text-sm text-brand-charcoal">{data.username}</code>
                    {renderCopyButton(data.username || "", "用户名")}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-brand-charcoal/65">
                    密码
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <code
                      className={cn(
                        "break-all text-sm text-brand-charcoal",
                        !showPassword && "tracking-widest"
                      )}
                    >
                      {showPassword ? data.password : "????????????"}
                    </code>
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="rounded p-1 text-brand-charcoal/65 transition-colors hover:text-brand-charcoal"
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
                  <p className="text-[11px] font-medium uppercase tracking-wide text-brand-charcoal/65">
                    TOTP Secret
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <code
                      className={cn(
                        "break-all text-sm text-brand-charcoal",
                        !showTotp && "tracking-widest"
                      )}
                    >
                      {showTotp ? data.totpSecret : "????????????????"}
                    </code>
                    <button
                      type="button"
                      onClick={() => setShowTotp((v) => !v)}
                      className="rounded p-1 text-brand-charcoal/65 transition-colors hover:text-brand-charcoal"
                      aria-label={showTotp ? "隐藏 TOTP Secret" : "显示 TOTP Secret"}
                    >
                      {showTotp ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                    {renderCopyButton(data.totpSecret || "", "TOTP Secret")}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-brand-charcoal/65">
                    otpauth 链接
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="break-all text-xs text-brand-charcoal/70">
                      {data.otpauthUrl}
                    </code>
                    {renderCopyButton(data.otpauthUrl || "", "otpauth 链接")}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-brand-charcoal/10 pt-4">
                <div>
                  <p className="text-sm font-medium text-brand-charcoal">应急账号二维码</p>
                  <p className="mt-0.5 text-[11px] text-brand-charcoal/65">
                    包含 otpauth 链接（TOTP Secret），仅 owner 可见，请勿截图外传。
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowQr((v) => !v)}
                  disabled={!data.qrCode}
                  aria-expanded={showQr}
                  leftIcon={
                    showQr ? <EyeOff className="h-4 w-4" /> : <QrCode className="h-4 w-4" />
                  }
                >
                  {showQr ? "隐藏二维码" : "显示二维码"}
                </Button>
              </div>

              {showQr && data.qrCode && (
                <div className="flex justify-center rounded-xl border border-brand-charcoal/10 bg-white p-4">
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
                  二维码生成失败，请使用上方 otpauth 链接手动导入。
                </p>
              )}

              <p className="border-t border-brand-charcoal/10 pt-3 text-[11px] leading-relaxed text-brand-charcoal/65">
                请勿截图或外传。使用完应急账号后应尽快恢复子站 <code>ADVISOR_BREAK_GLASS_*</code>{" "}
                配置并关闭应急入口。
              </p>
            </div>
          )}
        </div>
      </Modal>

      {totpModal}
    </>
  );
}
