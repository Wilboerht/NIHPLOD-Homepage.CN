"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import {
  COOKIE_CONSENT_EVENT,
  hasAnalyticsConsent,
  readCookieConsent,
} from "@/lib/cookie-consent";

interface AnalyticsScriptsProps {
  gaId?: string;
  baiduId?: string;
  nonce?: string;
}

export function AnalyticsScripts({ gaId, baiduId, nonce }: AnalyticsScriptsProps) {
  const pathname = usePathname();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAllowed(hasAnalyticsConsent()), 0);

    const onChange = () => {
      const next = readCookieConsent()?.analytics === true;
      setAllowed(next);
      if (typeof window !== "undefined" && typeof window.gtag === "function") {
        window.gtag("consent", "update", {
          analytics_storage: next ? "granted" : "denied",
        });
      }
    };

    window.addEventListener(COOKIE_CONSENT_EVENT, onChange);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(COOKIE_CONSENT_EVENT, onChange);
    };
  }, []);

  if (!allowed || pathname?.startsWith("/admin")) return null;

  return (
    <>
      {gaId ? (
        <>
          <Script
            id="google-analytics"
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            nonce={nonce}
          />
          <Script
            id="google-analytics-config"
            strategy="afterInteractive"
            nonce={nonce}
            dangerouslySetInnerHTML={{
              __html: `
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('consent', 'update', { analytics_storage: 'granted' });
                gtag('js', new Date());
                gtag('config', '${gaId}', {
                  page_path: window.location.pathname,
                  cookie_flags: 'SameSite=None;Secure',
                });
              `,
            }}
          />
        </>
      ) : null}

      {baiduId ? (
        <Script
          id="baidu-tongji"
          strategy="afterInteractive"
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `
              var _hmt = _hmt || [];
              (function() {
                var hm = document.createElement("script");
                hm.src = "https://hm.baidu.com/hm.js?${baiduId}";
                var s = document.getElementsByTagName("script")[0];
                s.parentNode.insertBefore(hm, s);
              })();
            `,
          }}
        />
      ) : null}
    </>
  );
}
