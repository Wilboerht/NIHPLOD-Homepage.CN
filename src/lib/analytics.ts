export type AnalyticsPropValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Record<string, unknown>
  | Array<Record<string, unknown>>;

export type AnalyticsProps = Record<string, AnalyticsPropValue>;

/**
 * Lightweight client-side tracking bridge.
 * It forwards events to common sinks when available:
 * 1) Google dataLayer
 * 2) gtag
 * 3) Custom browser event for internal listeners
 */
export function trackEvent(event: string, props?: AnalyticsProps) {
  if (typeof window === "undefined") return;

  const payload = {
    event,
    ...(props || {}),
  };

  const w = window as Window & {
    dataLayer?: Array<Record<string, unknown>>;
    gtag?: (command: string, eventName: string, eventParams?: Record<string, unknown>) => void;
  };

  if (Array.isArray(w.dataLayer)) {
    w.dataLayer.push(payload);
  }

  if (typeof w.gtag === "function") {
    w.gtag("event", event, props ? { ...props } : undefined);
  }

  window.dispatchEvent(
    new CustomEvent("app:analytics", {
      detail: payload,
    })
  );
}
