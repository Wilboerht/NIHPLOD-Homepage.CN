/**
 * Robots.txt 生成
 * Next.js 会自动在 /robots.txt 生成规则文件
 * 文档: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
 */
import { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

const DISALLOW_PATHS = ["/admin", "/api/"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // 不拦截 /_next/：Bing 等无专属分组的爬虫需要抓取 CSS/JS 才能正确渲染页面
        disallow: DISALLOW_PATHS,
      },
      // ================= GEO / AI 优化配置 =================
      {
        userAgent: [
          "OAI-SearchBot",
          "ChatGPT-User",
          "PerplexityBot",
          "Claude-User",
          "Google-Extended",
        ],
        allow: "/",
        disallow: DISALLOW_PATHS,
      },
      {
        userAgent: "ClaudeBot",
        disallow: "/", // 遵循通用建议，屏蔽其基础爬虫但允许用户授权爬虫
      },
      // ===================================================
      {
        // 百度爬虫特殊规则
        userAgent: "Baiduspider",
        allow: "/",
        disallow: DISALLOW_PATHS,
        crawlDelay: 1, // 爬取间隔 1 秒
      },
      {
        // 百度渲染爬虫（抓取 JS 渲染后的页面）
        userAgent: "Baiduspider-render",
        allow: "/",
        disallow: DISALLOW_PATHS,
        crawlDelay: 2, // 渲染抓取较耗资源，间隔稍长
      },
      {
        // 谷歌爬虫特殊规则
        userAgent: "Googlebot",
        allow: "/",
        disallow: DISALLOW_PATHS,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    // Yandex 规范要求裸域名（不含协议）
    host: new URL(SITE_URL).host,
  };
}
