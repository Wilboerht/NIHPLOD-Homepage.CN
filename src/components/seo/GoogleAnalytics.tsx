/**
 * Google Analytics (GA4) 脚本
 * 在 layout.tsx 中引入此组件
 *
 * 使用前：将 NEXT_PUBLIC_GA_ID 设置为你的 GA4 测量 ID（格式：G-XXXXXXXXXX）
 * 获取 ID：Google Analytics -> 管理 -> 数据流 -> 复制测量 ID
 */
import Script from "next/script";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export function GoogleAnalytics() {
  if (!GA_ID) return null;

  return (
    <>
      <Script
        id="google-analytics"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
      />
      <Script
        id="google-analytics-config"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}', {
              page_path: window.location.pathname,
              cookie_flags: 'SameSite=None;Secure',
            });
          `,
        }}
      />
    </>
  );
}
