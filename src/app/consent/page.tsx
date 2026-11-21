"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet, apiPost, ApiError, getApiErrorMessage } from "@/lib/api-client";
import { Checkbox } from "@/components/ui/Checkbox";
import { useAuth } from "@/contexts/AuthContext";

export const dynamic = "force-dynamic";

interface ConsentStatus {
  required: boolean;
  missing: string[];
  versions: { privacy: string; terms: string };
}

function isSafeReturnTo(value: string): boolean {
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  return true;
}

export default function ConsentPage() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("return_to") || "/";
  const [privacy, setPrivacy] = useState(false);
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [idempotencyKey] = useState(
    () => `consent-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await apiGet<ConsentStatus>("/api/user/consent");
        if (cancelled) return;
        if (!status.required) {
          router.replace(isSafeReturnTo(returnTo) ? returnTo : "/");
          return;
        }
      } catch (err) {
        if (cancelled) return;
        const message = getApiErrorMessage(err, "请先登录");
        setError(message);
        if (err instanceof ApiError && err.status === 401) {
          router.replace(
            `/login?return_to=${encodeURIComponent(`/consent?return_to=${returnTo}`)}`
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [returnTo, router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!privacy || !terms) {
      setError("请先阅读并同意隐私政策与服务条款");
      return;
    }
    setSubmitting(true);
    try {
      await apiPost("/api/user/consent", {
        privacy: true,
        terms: true,
        marketing,
        idempotencyKey,
      });
      await refreshUser(true).catch(() => undefined);
      if (isSafeReturnTo(returnTo)) {
        if (returnTo.startsWith("/api/oauth/authorize")) {
          window.location.assign(returnTo);
          return;
        }
        router.replace(returnTo);
        return;
      }
      router.replace("/");
    } catch (err) {
      setError(getApiErrorMessage(err, "保存失败，请稍后重试"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <p className="text-sm text-brand-charcoal/60">正在加载…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col justify-center px-6 py-16">
      <h1 className="text-center text-2xl font-light tracking-[0.12em] text-brand-charcoal">
        隐私政策与服务条款更新
      </h1>
      <p className="mt-6 text-sm leading-7 text-brand-charcoal/70">
        我们更新了隐私政策与服务条款。为继续使用账户相关功能，请阅读并确认以下内容。
        您可以随时在账户设置中撤回营销同意。
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <Checkbox
          id="consent-privacy"
          checked={privacy}
          onChange={setPrivacy}
          label={
            <span className="text-sm leading-6 text-brand-charcoal/80">
              我已阅读并同意
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="mx-1 underline underline-offset-2"
              >
                《隐私政策》
              </a>
            </span>
          }
        />
        <Checkbox
          id="consent-terms"
          checked={terms}
          onChange={setTerms}
          label={
            <span className="text-sm leading-6 text-brand-charcoal/80">
              我已阅读并同意
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="mx-1 underline underline-offset-2"
              >
                《服务条款》
              </a>
            </span>
          }
        />
        <Checkbox
          id="consent-marketing"
          checked={marketing}
          onChange={setMarketing}
          label={
            <span className="text-sm leading-6 text-brand-charcoal/80">
              我同意接收产品资讯、活动与生日礼遇等营销信息（可选，可随时撤回）
            </span>
          }
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full border border-brand-charcoal bg-brand-charcoal px-6 py-3 text-sm tracking-[0.12em] text-white transition-opacity disabled:opacity-50"
        >
          {submitting ? "保存中…" : "确认并继续"}
        </button>
      </form>
    </main>
  );
}
