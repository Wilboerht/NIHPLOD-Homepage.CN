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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);

  useEffect(() => {
    const stored = readCookieConsent();
    const timer = setTimeout(() => {
      if (!stored) {
        setVisible(true);
        setSettingsOpen(true);
      } else {
        setAnalytics(stored.analytics);
      }
    }, 0);

    const open = () => {
      setVisible(true);
      setSettingsOpen(true);
      setAnalytics(readCookieConsent()?.analytics ?? false);
    };
    window.addEventListener(COOKIE_SETTINGS_EVENT, open);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(COOKIE_SETTINGS_EVENT, open);
    };
  }, []);

  const save = (nextAnalytics: boolean) => {
    writeCookieConsent({ analytics: nextAnalytics, marketing: false });
    setAnalytics(nextAnalytics);
    setVisible(false);
    setSettingsOpen(false);
  };

  if (pathname?.startsWith("/admin")) return null;
  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[80] px-3 pb-3 md:px-6 md:pb-6">
      <div className="mx-auto max-w-3xl border border-brand-charcoal/15 bg-[#fefcf8] p-5 shadow-xl md:p-6">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-medium tracking-wide text-brand-charcoal">
              我们使用 Cookie
            </p>
            <p className="mt-2 text-xs leading-6 text-brand-charcoal/70 md:text-sm">
              必要 Cookie 用于登录与安全；分析 Cookie 帮助我们了解网站使用情况。
              您可以选择仅必要，或允许分析 Cookie。详情见
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="mx-1 underline underline-offset-2"
              >
                《隐私政策》
              </a>
              。
            </p>
          </div>

          {settingsOpen && (
            <div className="space-y-3 border-t border-brand-charcoal/10 pt-4">
              <label className="flex items-start justify-between gap-4 text-sm text-brand-charcoal/80">
                <span>
                  <span className="block font-medium">必要 Cookie</span>
                  <span className="mt-1 block text-xs text-brand-charcoal/55">
                    登录、安全、CSRF 防护，无法关闭。
                  </span>
                </span>
                <input type="checkbox" checked disabled className="mt-1 accent-[#8B7355]" />
              </label>
              <label className="flex items-start justify-between gap-4 text-sm text-brand-charcoal/80">
                <span>
                  <span className="block font-medium">分析 Cookie</span>
                  <span className="mt-1 block text-xs text-brand-charcoal/55">
                    Google Analytics，用于统计访问与改进网站。
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={analytics}
                  onChange={(event) => setAnalytics(event.target.checked)}
                  className="mt-1 accent-[#8B7355]"
                />
              </label>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => save(false)}
              className="border border-brand-charcoal/25 px-4 py-2 text-xs tracking-[0.08em] text-brand-charcoal transition-colors hover:bg-brand-charcoal/[0.04]"
            >
              仅必要
            </button>
            <button
              type="button"
              onClick={() => save(true)}
              className="border border-brand-charcoal bg-brand-charcoal px-4 py-2 text-xs tracking-[0.08em] text-white transition-opacity hover:opacity-90"
            >
              接受分析
            </button>
            {!settingsOpen && (
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="px-4 py-2 text-xs tracking-[0.08em] text-brand-charcoal/70 underline underline-offset-2"
              >
                自定义
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
