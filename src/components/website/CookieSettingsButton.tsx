"use client";

import { COOKIE_SETTINGS_EVENT } from "@/lib/cookie-consent";

export function CookieSettingsButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(COOKIE_SETTINGS_EVENT))}
      className="transition-colors hover:text-brand-charcoal"
    >
      Cookie 设置
    </button>
  );
}
