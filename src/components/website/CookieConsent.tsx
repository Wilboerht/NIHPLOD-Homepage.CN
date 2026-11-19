"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
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
            className="rounded-full border border-brand-charcoal/20 px-4 py-2 text-xs tracking-[0.08em] text-brand-charcoal transition-colors hover:bg-brand-charcoal/[0.04]"
          >
            仅必要
          </button>
          <button
            type="button"
            onClick={() => save(analytics)}
            className="rounded-full bg-brand-charcoal px-4 py-2 text-xs font-medium tracking-[0.08em] text-white transition-opacity hover:opacity-90"
          >
            保存选择
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-brand-charcoal">必要 Cookie</p>
              <p className="mt-1 text-xs leading-5 text-ink-muted">
                登录、会话保持与 CSRF 安全防护，无法关闭。
              </p>
            </div>
            <input
              type="checkbox"
              checked
              disabled
              className="mt-1 h-4 w-4 shrink-0 accent-[#00263E]"
            />
          </div>

          <label className="flex cursor-pointer items-start justify-between gap-4">
            <span>
              <span className="block text-sm font-medium text-brand-charcoal">分析 Cookie</span>
              <span className="mt-1 block text-xs leading-5 text-ink-muted">
                Google Analytics，用于统计访问情况与改进网站体验。
              </span>
            </span>
            <input
              type="checkbox"
              checked={analytics}
              onChange={(event) => setAnalytics(event.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 accent-[#00263E]"
            />
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
