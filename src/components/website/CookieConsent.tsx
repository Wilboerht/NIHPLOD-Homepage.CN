"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { COOKIE_SETTINGS_EVENT, writeCookieConsent } from "@/lib/cookie-consent";

export function CookieConsent() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const reopen = () => setVisible(true);
    window.addEventListener(COOKIE_SETTINGS_EVENT, reopen);
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, reopen);
  }, []);

  const save = (nextAnalytics: boolean) => {
    writeCookieConsent({ analytics: nextAnalytics, marketing: false });
    setVisible(false);
  };

  if (pathname?.startsWith("/admin")) return null;
  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(1rem,env(safe-area-inset-top))] z-[90] flex justify-center px-4">
      <div
        role="region"
        aria-label="Cookie 使用提示"
        className="pointer-events-auto flex max-w-full flex-col items-center gap-2 rounded-3xl border border-brand-charcoal/10 bg-[#fefcf8]/95 px-4 py-2.5 text-center text-xs text-brand-charcoal/70 shadow-[0_10px_36px_-16px_rgba(0,38,62,0.35)] backdrop-blur-md sm:flex-row sm:gap-4 sm:rounded-full sm:py-1.5 sm:pl-5 sm:pr-1.5 sm:text-left"
      >
        <p className="leading-5">
          Cookie 用于提升体验与保障安全，详情见
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="mx-1 underline underline-offset-2 hover:text-brand-charcoal"
          >
            《隐私政策》
          </a>
          。
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => save(false)}
            className="rounded-full px-3 py-1.5 tracking-[0.06em] text-brand-charcoal/70 transition-colors hover:bg-brand-charcoal/[0.06] hover:text-brand-charcoal"
          >
            仅必要
          </button>
          <button
            type="button"
            onClick={() => save(true)}
            className="rounded-full bg-brand-charcoal px-3.5 py-1.5 font-medium tracking-[0.06em] text-white transition-opacity hover:opacity-90"
          >
            接受分析
          </button>
          <button
            type="button"
            onClick={() => setVisible(false)}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-full text-brand-charcoal/40 transition-colors hover:bg-brand-charcoal/[0.06] hover:text-brand-charcoal"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
