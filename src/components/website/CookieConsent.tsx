"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import { COOKIE_SETTINGS_EVENT, readCookieConsent, writeCookieConsent } from "@/lib/cookie-consent";

export function CookieConsent() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);

  useEffect(() => {
    const openSettings = () => {
      setAnalytics(readCookieConsent()?.analytics ?? false);
      setOpen(true);
    };
    window.addEventListener(COOKIE_SETTINGS_EVENT, openSettings);
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, openSettings);
  }, []);

  const save = (nextAnalytics: boolean) => {
    writeCookieConsent({ analytics: nextAnalytics, marketing: false });
    setOpen(false);
  };

  if (pathname?.startsWith("/admin")) return null;

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Cookie 设置"
      description="您可以选择允许哪些 Cookie。必要 Cookie 用于登录与安全，始终启用。"
      size="md"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => save(false)}
            className="inline-flex h-10 items-center justify-center rounded-full border border-brand-charcoal/25 px-5 text-[13px] font-light tracking-[0.08em] text-brand-charcoal transition-colors hover:border-brand-charcoal/40 hover:bg-brand-charcoal/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/25 focus-visible:ring-offset-2"
          >
            仅必要
          </button>
          <button
            type="button"
            onClick={() => save(analytics)}
            className="inline-flex h-10 items-center justify-center rounded-full border border-brand-charcoal/15 bg-brand-ecru px-5 text-[13px] font-normal tracking-[0.08em] text-brand-charcoal shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_1px_2px_rgba(0,38,62,0.08)] transition-colors hover:bg-[#dcd0b2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/25 focus-visible:ring-offset-2"
          >
            保存选择
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="divide-y divide-brand-charcoal/[0.06] overflow-hidden rounded-xl border border-brand-charcoal/10">
          <div className="flex items-start justify-between gap-6 px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-brand-charcoal">必要 Cookie</p>
              <p className="mt-1 text-xs leading-5 text-ink-muted">
                登录、会话保持与 CSRF 安全防护。
              </p>
            </div>
            <span className="mt-0.5 shrink-0 rounded-full bg-brand-charcoal/[0.06] px-2.5 py-1 text-[10px] font-light tracking-[0.08em] text-brand-charcoal/55">
              始终启用
            </span>
          </div>

          <label className="flex cursor-pointer items-start justify-between gap-6 px-4 py-3.5">
            <span>
              <span className="block text-sm font-medium text-brand-charcoal">分析 Cookie</span>
              <span className="mt-1 block text-xs leading-5 text-ink-muted">
                Google Analytics，用于统计访问情况与改进网站体验。
              </span>
            </span>
            <span className="relative mt-0.5 inline-flex shrink-0">
              <input
                type="checkbox"
                checked={analytics}
                onChange={(event) => setAnalytics(event.target.checked)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className="flex h-[22px] w-[38px] items-center rounded-full bg-brand-charcoal/15 p-[2px] transition-colors duration-200 peer-checked:bg-brand-primary peer-focus-visible:ring-2 peer-focus-visible:ring-brand-primary/30 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-white"
              >
                <span
                  className={cn(
                    "h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform duration-200",
                    analytics ? "translate-x-4" : "translate-x-0"
                  )}
                />
              </span>
            </span>
          </label>
        </div>

        <p className="text-xs leading-5 text-ink-muted">
          详情请阅读
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="mx-1 underline underline-offset-2 transition-colors hover:text-brand-charcoal"
          >
            《隐私政策》
          </a>
          。
        </p>
      </div>
    </Modal>
  );
}
