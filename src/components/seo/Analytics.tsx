import { getNonce } from "@/lib/nonce";
import { AnalyticsScripts } from "./AnalyticsScripts";

/**
 * 分析脚本统一入口：
 * 1. 先注入 Consent Mode v2 默认拒绝（不加载第三方脚本）；
 * 2. 用户同意分析 Cookie 后，再由客户端组件加载 GA / 百度统计。
 */
export async function Analytics() {
  const nonce = await getNonce();

  return (
    <>
      <script
        id="consent-mode-default"
        nonce={nonce}
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('consent', 'default', {
              ad_storage: 'denied',
              ad_user_data: 'denied',
              ad_personalization: 'denied',
              analytics_storage: 'denied',
              functionality_storage: 'granted',
              security_storage: 'granted'
            });
          `,
        }}
      />
      <AnalyticsScripts
        gaId={process.env.NEXT_PUBLIC_GA_ID}
        nonce={nonce}
      />
    </>
  );
}
