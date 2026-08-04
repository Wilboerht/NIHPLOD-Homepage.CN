/**
 * 百度统计脚本
 * 在 layout.tsx 中引入此组件
 *
 * 使用前：将 BAIDU_TONGJI_ID 替换为你的百度统计 ID
 * 获取 ID：百度统计 -> 管理 -> 代码获取 -> 找到 hm.src 中的 ? 后面的字符串
 */
import Script from "next/script";
import { getNonce } from "@/lib/nonce";

const BAIDU_TONGJI_ID = process.env.NEXT_PUBLIC_BAIDU_TONGJI_ID;

export async function BaiduAnalytics() {
  if (!BAIDU_TONGJI_ID) return null;

  const nonce = await getNonce();

  return (
    <Script
      id="baidu-tongji"
      strategy="afterInteractive"
      nonce={nonce}
      dangerouslySetInnerHTML={{
        __html: `
          var _hmt = _hmt || [];
          (function() {
            var hm = document.createElement("script");
            hm.src = "https://hm.baidu.com/hm.js?${BAIDU_TONGJI_ID}";
            var s = document.getElementsByTagName("script")[0];
            s.parentNode.insertBefore(hm, s);
          })();
        `,
      }}
    />
  );
}
