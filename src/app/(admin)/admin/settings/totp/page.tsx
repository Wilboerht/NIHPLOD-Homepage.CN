"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  Shield,
  ShieldCheck,
  AlertTriangle,
  Copy,
  Check,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface TOTPSetupData {
  qrCode: string;
  secret: string;
  backupCodes: string[];
}

export default function TOTPSettingsPage() {
  const toast = useToast();
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [setupData, setSetupData] = useState<TOTPSetupData | null>(null);
  const [setupPassword, setSetupPassword] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [processing, setProcessing] = useState(false);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [showTotpSecret, setShowTotpSecret] = useState(false);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const data = await apiGet<{ totpEnabled: boolean }>("/api/admin/totp/status");
        setTotpEnabled(data.totpEnabled);
      } catch {
        toast.error("获取二次验证状态失败");
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, [toast]);

  const startSetup = async () => {
    // 幂等守卫：连按 Enter 不能重复创建密钥（后一次会覆盖前一次，导致二维码与库内不一致）
    if (processing) return;
    if (!setupPassword) {
      toast.error("请输入当前密码以验证身份");
      return;
    }
    setProcessing(true);
    try {
      const data = await apiPost<TOTPSetupData>("/api/admin/totp/setup", {
        password: setupPassword,
      });
      setSetupData(data);
      setSetupPassword("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "初始化失败");
    } finally {
      setProcessing(false);
    }
  };

  const verifySetup = async () => {
    if (verifyCode.length !== 6) {
      toast.error("请输入6位验证码");
      return;
    }
    setProcessing(true);
    try {
      await apiPost("/api/admin/totp/verify-setup", { code: verifyCode });
      toast.success("二次验证已启用");
      setTotpEnabled(true);
      setSetupData(null);
      setVerifyCode("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "验证失败");
    } finally {
      setProcessing(false);
    }
  };

  /** 校验输入后打开确认弹窗（关闭二次验证属高风险动作） */
  const requestDisable = () => {
    if (!disablePassword) {
      toast.error("请输入密码");
      return;
    }
    if (disableCode.trim().length < 6) {
      toast.error("请输入 6 位动态验证码或备用码");
      return;
    }
    setShowDisableConfirm(true);
  };

  const disableTOTP = async (): Promise<boolean> => {
    setProcessing(true);
    try {
      await apiPost("/api/admin/totp/disable", {
        password: disablePassword,
        totpCode: disableCode.trim(),
      });
      toast.success("二次验证已关闭");
      setTotpEnabled(false);
      setDisablePassword("");
      setDisableCode("");
      return true;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "关闭失败");
      return false;
    } finally {
      setProcessing(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("复制失败");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-brand-primary" />
        <h1 className="text-2xl font-bold text-brand-charcoal">二次验证设置</h1>
      </div>

      <div className="rounded-lg border border-brand-charcoal/15 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className={cn("rounded-full p-3", totpEnabled ? "bg-emerald-100" : "bg-amber-100")}>
            {totpEnabled ? (
              <ShieldCheck className="h-6 w-6 text-emerald-600" />
            ) : (
              <Shield className="h-6 w-6 text-amber-600" />
            )}
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-medium text-brand-charcoal">
              {totpEnabled ? "二次验证已启用" : "二次验证未启用"}
            </h2>
            <p className="mt-1 text-sm text-brand-charcoal/50">
              {totpEnabled
                ? "您的账号已启用基于 TOTP 的二次验证，登录时需要输入动态验证码。"
                : "启用二次验证后，登录时除了密码还需要输入 Authenticator 应用生成的 6 位动态验证码，大幅提升账号安全性。"}
            </p>
          </div>
        </div>
      </div>

      {!totpEnabled && !setupData && (
        <div className="space-y-3 rounded-lg border border-brand-charcoal/15 bg-white p-6 shadow-sm">
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-charcoal/80">
              当前密码 <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={setupPassword}
              onChange={(e) => setSetupPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && startSetup()}
              className="w-full max-w-sm rounded-lg border border-brand-charcoal/20 px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
              placeholder="请输入当前登录密码"
              autoComplete="current-password"
            />
            <p className="mt-1 text-xs text-brand-charcoal/40">出于安全考虑，启用前需验证当前密码</p>
          </div>
          <button
            onClick={startSetup}
            disabled={processing || !setupPassword}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-primary/90 disabled:opacity-50"
          >
            {processing && <Loader2 className="h-4 w-4 animate-spin" />}
            启用二次验证
          </button>
        </div>
      )}

      {setupData && (
        <div className="rounded-lg border border-brand-charcoal/15 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">请妥善保存以下信息</span>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <p className="text-sm font-medium text-brand-charcoal/80">
                1. 使用 Authenticator 应用扫描二维码
              </p>
              <div className="relative inline-block overflow-hidden rounded-lg border border-brand-charcoal/15">
                <Image src={setupData.qrCode} alt="TOTP QR Code" width={200} height={200} />
              </div>
              <div className="flex items-center gap-2">
                <code className="bg-brand-charcoal/8 rounded px-2 py-1 text-xs text-brand-charcoal/80">
                  {showTotpSecret ? setupData.secret : "••••••••••••••••"}
                </code>
                <Tooltip content={showTotpSecret ? "隐藏密钥" : "显示密钥"} side="top">
                  <button
                    onClick={() => setShowTotpSecret(!showTotpSecret)}
                    className="inline-flex text-brand-charcoal/50 hover:text-brand-charcoal"
                  >
                    {showTotpSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </Tooltip>
                <Tooltip content="复制密钥" side="top">
                  <button
                    onClick={() => copyToClipboard(setupData.secret, "secret")}
                    className="inline-flex text-brand-charcoal/50 hover:text-brand-charcoal"
                  >
                    {copied === "secret" ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </Tooltip>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-brand-charcoal/80">
                2. 备用码（仅显示一次，请保存）
              </p>
              <div className="grid grid-cols-2 gap-2">
                {setupData.backupCodes.map((code, index) => (
                  <div
                    key={index}
                    onClick={() => copyToClipboard(code, `backup-${index}`)}
                    className="hover:bg-brand-charcoal/8 flex cursor-pointer items-center justify-between rounded bg-brand-charcoal/[0.03] px-3 py-2 font-mono text-xs text-brand-charcoal/80"
                  >
                    <span>{code}</span>
                    {copied === `backup-${index}` ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3 text-brand-charcoal/50" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-end gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-brand-charcoal/80">
                输入 6 位验证码完成绑定
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                className="w-full rounded-lg border border-brand-charcoal/20 px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                placeholder="000000"
              />
            </div>
            <button
              onClick={verifySetup}
              disabled={processing || verifyCode.length !== 6}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-primary/90 disabled:opacity-50"
            >
              {processing && <Loader2 className="h-4 w-4 animate-spin" />}
              确认启用
            </button>
          </div>
        </div>
      )}

      {totpEnabled && (
        <div className="rounded-lg border border-brand-charcoal/15 bg-white p-6 shadow-sm">
          <h3 className="mb-3 text-base font-medium text-brand-charcoal">关闭二次验证</h3>
          <p className="mb-4 text-sm text-brand-charcoal/50">
            关闭后登录不再需要动态验证码，账号安全性将降低。
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[12rem] flex-1">
              <label className="mb-1 block text-sm font-medium text-brand-charcoal/80">
                当前密码
              </label>
              <input
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                className="w-full rounded-lg border border-brand-charcoal/20 px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                placeholder="请输入当前密码"
                autoComplete="current-password"
              />
            </div>
            <div className="min-w-[12rem] flex-1">
              <label className="mb-1 block text-sm font-medium text-brand-charcoal/80">
                动态验证码 / 备用码
              </label>
              <input
                type="text"
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value)}
                className="w-full rounded-lg border border-brand-charcoal/20 px-3 py-2 font-mono text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                placeholder="6 位验证码或备用码"
                autoComplete="one-time-code"
              />
            </div>
            <button
              onClick={requestDisable}
              disabled={processing || !disablePassword || disableCode.trim().length < 6}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {processing && <Loader2 className="h-4 w-4 animate-spin" />}
              关闭二次验证
            </button>
          </div>
        </div>
      )}

      {/* 关闭二次验证确认 */}
      <ConfirmDialog
        open={showDisableConfirm}
        onClose={() => setShowDisableConfirm(false)}
        onConfirm={async () => {
          const ok = await disableTOTP();
          if (ok) setShowDisableConfirm(false);
        }}
        title="关闭二次验证"
        description="关闭后登录不再需要动态验证码，账号安全性将降低。确定要关闭吗？"
        type="danger"
        confirmText="确认关闭"
        loading={processing}
      />
    </div>
  );
}
