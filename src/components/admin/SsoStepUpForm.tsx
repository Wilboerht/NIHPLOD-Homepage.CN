"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { apiPost, ApiError, getApiErrorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface Props {
  clientId: string;
  clientName: string;
  redirectUri: string;
  state: string;
  action: string;
  actionLabel: string;
  resourceId: string;
}

interface TicketResponse {
  ticket: string;
  redirectUri: string;
  state: string;
  action: string;
  resourceId: string;
  expiresIn: number;
}

export function SsoStepUpForm({
  clientId,
  clientName,
  redirectUri,
  state,
  action,
  actionLabel,
  resourceId,
}: Props) {
  const [totpCode, setTotpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!totpCode.trim()) {
      setError("请输入身份验证器中的 6 位验证码");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiPost<TicketResponse>("/api/admin/sso/step-up/ticket", {
        clientId,
        redirectUri,
        state,
        action,
        resourceId,
        totpCode: totpCode.trim(),
      });
      const form = document.createElement("form");
      form.method = "POST";
      form.action = data.redirectUri;
      for (const [name, value] of Object.entries({
        ticket: data.ticket,
        state: data.state,
      })) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      if (err instanceof ApiError && err.code === "TOTP_NOT_ENABLED") {
        setError("请先在主站「管理员安全中心」启用二次验证（TOTP）。");
      } else {
        setError(getApiErrorMessage(err, "二次验证失败，请重试"));
      }
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-brand-cream px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-brand-charcoal/10 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-brand-primary/[0.08] p-2.5 text-brand-primary">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-brand-charcoal">高风险操作验证</h1>
            <p className="mt-1 text-sm text-brand-charcoal/65">
              {clientName} · {actionLabel}
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
          这是一次性、短时有效的操作授权，仅对当前证书有效。完成后页面会自动返回 {clientName}。
        </div>

        <div className="mt-3 rounded-lg border border-brand-charcoal/10 bg-brand-charcoal/[0.03] px-3 py-2 text-xs text-brand-charcoal/65">
          <span className="font-medium">操作对象：</span>
          <code className="break-all font-mono">
            {resourceId === "new" ? "新证书（核发后生成）" : resourceId}
          </code>
        </div>

        <label className="mt-5 block text-sm font-medium text-brand-charcoal">
          身份验证器验证码
        </label>
        <Input
          className="mt-2"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={20}
          placeholder="6 位验证码或备份码"
          value={totpCode}
          onChange={(event) => setTotpCode(event.target.value)}
          disabled={loading}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
        />

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {error}
          </p>
        )}

        <Button className="mt-5 w-full" onClick={() => void submit()} loading={loading}>
          验证并继续
        </Button>

        <div className="mt-4 text-center text-xs text-brand-charcoal/55">
          <Link href="/admin/settings/totp" className="text-brand-primary hover:underline">
            管理主站二次验证
          </Link>
        </div>
      </div>
    </div>
  );
}
