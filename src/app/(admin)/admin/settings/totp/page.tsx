"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Shield, ShieldCheck, AlertTriangle, Copy, Check, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPost } from "@/lib/api-client";

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
  const [verifyCode, setVerifyCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [processing, setProcessing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startSetup = async () => {
    setProcessing(true);
    try {
      const data = await apiPost<TOTPSetupData>("/api/admin/totp/setup");
      setSetupData(data);
    } catch {
      toast.error("初始化失败");
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
    } catch {
      toast.error("验证失败");
    } finally {
      setProcessing(false);
    }
  };

  const disableTOTP = async () => {
    if (!disablePassword) {
      toast.error("请输入密码");
      return;
    }
    setProcessing(true);
    try {
      await apiPost("/api/admin/totp/disable", { password: disablePassword });
      toast.success("二次验证已关闭");
      setTotpEnabled(false);
      setDisablePassword("");
    } catch {
      toast.error("关闭失败");
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
        <Loader2 className="h-8 w-8 animate-spin text-brand-gold" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-brand-gold" />
        <h1 className="text-2xl font-bold text-gray-900">二次验证设置</h1>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className={cn("rounded-full p-3", totpEnabled ? "bg-green-100" : "bg-yellow-100")}>
            {totpEnabled ? (
              <ShieldCheck className="h-6 w-6 text-green-600" />
            ) : (
              <Shield className="h-6 w-6 text-yellow-600" />
            )}
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">
              {totpEnabled ? "二次验证已启用" : "二次验证未启用"}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {totpEnabled
                ? "您的账号已启用基于 TOTP 的二次验证，登录时需要输入动态验证码。"
                : "启用二次验证后，登录时除了密码还需要输入 Authenticator 应用生成的 6 位动态验证码，大幅提升账号安全性。"}
            </p>
          </div>
        </div>
      </div>

      {!totpEnabled && !setupData && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <button
            onClick={startSetup}
            disabled={processing}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-white hover:bg-brand-gold/90 disabled:opacity-50"
          >
            {processing && <Loader2 className="h-4 w-4 animate-spin" />}
            启用二次验证
          </button>
        </div>
      )}

      {setupData && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">请妥善保存以下信息</span>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">1. 使用 Authenticator 应用扫描二维码</p>
              <div className="relative inline-block overflow-hidden rounded-lg border border-gray-200">
                <Image src={setupData.qrCode} alt="TOTP QR Code" width={200} height={200} />
              </div>
              <div className="flex items-center gap-2">
                <code className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">{setupData.secret}</code>
                <button
                  onClick={() => copyToClipboard(setupData.secret, "secret")}
                  className="text-gray-400 hover:text-gray-600"
                  title="复制密钥"
                >
                  {copied === "secret" ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">2. 备用码（仅显示一次，请保存）</p>
              <div className="grid grid-cols-2 gap-2">
                {setupData.backupCodes.map((code, index) => (
                  <div
                    key={index}
                    onClick={() => copyToClipboard(code, `backup-${index}`)}
                    className="flex cursor-pointer items-center justify-between rounded bg-gray-50 px-3 py-2 text-xs font-mono text-gray-700 hover:bg-gray-100"
                  >
                    <span>{code}</span>
                    {copied === `backup-${index}` ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3 text-gray-400" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-end gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700">输入 6 位验证码完成绑定</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold"
                placeholder="000000"
              />
            </div>
            <button
              onClick={verifySetup}
              disabled={processing || verifyCode.length !== 6}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-white hover:bg-brand-gold/90 disabled:opacity-50"
            >
              {processing && <Loader2 className="h-4 w-4 animate-spin" />}
              确认启用
            </button>
          </div>
        </div>
      )}

      {totpEnabled && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-3 text-base font-semibold text-gray-900">关闭二次验证</h3>
          <p className="mb-4 text-sm text-gray-500">关闭后登录不再需要动态验证码，账号安全性将降低。</p>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700">当前密码</label>
              <input
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold"
                placeholder="请输入当前密码"
              />
            </div>
            <button
              onClick={disableTOTP}
              disabled={processing || !disablePassword}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {processing && <Loader2 className="h-4 w-4 animate-spin" />}
              关闭二次验证
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
