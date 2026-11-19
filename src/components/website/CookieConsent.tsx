"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  COOKIE_SETTINGS_EVENT,
  readCookieConsent,
  writeCookieConsent,
} from "@/lib/cookie-consent";

export function CookieConsent() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = readCookieConsent();
    const timer = setTimeout(() => {
      if (!stored) setVisible(true);
    }, 0);

    const open = () => setVisible(true);
    window.addEventListener(COOKIE_SETTINGS_EVENT, open);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(COOKIE_SETTINGS_EVENT, open);
    };
  }, []);

  const save = (nextAnalytics: boolean) => {
    writeCookieConsent({ analytics: nextAnalytics, marketing: false });
    setVisible(false);
  };

  if (pathname?.startsWith("/admin")) return null;
  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Cookie 使用提示"
      className="fixed inset-x-0 top-0 z-[90] border-b border-brand-charcoal/10 bg-[#fefcf8]/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-2.5 text-xs text-brand-charcoal/70 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:text-sm">
        <p className="leading-5">
          我们使用 Cookie 提升浏览体验，必要 Cookie 用于登录与安全。详情见
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
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => save(false)}
            className="border border-brand-charcoal/25 px-3 py-1.5 text-xs tracking-[0.08em] text-brand-charcoal transition-colors hover:bg-brand-charcoal/[0.04]"
          >
            仅必要
          </button>
          <button
            type="button"
            onClick={() => save(true)}
            className="border border-brand-charcoal bg-brand-charcoal px-3 py-1.5 text-xs tracking-[0.08em] text-white transition-opacity hover:opacity-90"
          >
            接受分析
          </button>
        </div>
      </div>
    </div>
  );
}
