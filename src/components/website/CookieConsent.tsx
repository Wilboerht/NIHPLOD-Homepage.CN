"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { COOKIE_SETTINGS_EVENT, readCookieConsent, writeCookieConsent } from "@/lib/cookie-consent";

const BANNER_CLASS = "has-cookie-banner";
const BANNER_OFFSET_VAR = "--cookie-banner-offset";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function CookieConsent() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);
  const show = visible && !pathname?.startsWith("/admin");

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!readCookieConsent()) setVisible(true);
    }, 0);

    const reopen = () => setVisible(true);
    window.addEventListener(COOKIE_SETTINGS_EVENT, reopen);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(COOKIE_SETTINGS_EVENT, reopen);
    };
  }, []);

  useIsomorphicLayoutEffect(() => {
    const root = document.documentElement;

    if (!show) {
      root.classList.remove(BANNER_CLASS);
      root.style.removeProperty(BANNER_OFFSET_VAR);
      return;
    }

    const banner = bannerRef.current;
    if (!banner) return;

    const syncOffset = () => {
      root.style.setProperty(BANNER_OFFSET_VAR, `${banner.getBoundingClientRect().height}px`);
    };
    syncOffset();
    root.classList.add(BANNER_CLASS);

    if (typeof ResizeObserver === "undefined") {
      return () => {
        root.classList.remove(BANNER_CLASS);
        root.style.removeProperty(BANNER_OFFSET_VAR);
      };
    }

    const observer = new ResizeObserver(syncOffset);
    observer.observe(banner);

    return () => {
      observer.disconnect();
      root.classList.remove(BANNER_CLASS);
      root.style.removeProperty(BANNER_OFFSET_VAR);
    };
  }, [show]);

  const save = (nextAnalytics: boolean) => {
    writeCookieConsent({ analytics: nextAnalytics, marketing: false });
    setVisible(false);
  };

  if (!show) return null;

  return (
    <div
      ref={bannerRef}
      role="region"
      aria-label="Cookie 使用提示"
      className="fixed inset-x-0 top-0 z-[90] border-b border-brand-charcoal/10 bg-[#fefcf8]/95 pt-[env(safe-area-inset-top)] backdrop-blur"
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
