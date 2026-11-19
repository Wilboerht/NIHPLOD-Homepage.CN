export const COOKIE_CONSENT_KEY = "nihplod_cookie_consent_v1";
export const COOKIE_CONSENT_EVENT = "nihplod:cookie-consent";
export const COOKIE_SETTINGS_EVENT = "nihplod:open-cookie-settings";

export interface CookieConsentState {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  version: string;
  updatedAt: string;
}

export function readCookieConsent(): CookieConsentState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CookieConsentState>;
    if (typeof parsed.analytics !== "boolean") return null;
    return {
      necessary: true,
      analytics: parsed.analytics,
      marketing: parsed.marketing === true,
      version: typeof parsed.version === "string" ? parsed.version : "1",
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
    };
  } catch {
    return null;
  }
}

export function writeCookieConsent(
  next: Pick<CookieConsentState, "analytics" | "marketing">
): CookieConsentState {
  const state: CookieConsentState = {
    necessary: true,
    analytics: next.analytics,
    marketing: next.marketing,
    version: "1",
    updatedAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT, { detail: state }));
  }
  return state;
}

export function hasAnalyticsConsent(): boolean {
  return readCookieConsent()?.analytics === true;
}
