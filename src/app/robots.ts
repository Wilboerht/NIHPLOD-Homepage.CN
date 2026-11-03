/**
 * Robots.txt 生成
 * Next.js 会自动在 /robots.txt 生成规则文件
 * 文档: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
 */
import { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

// "/admin" 为前缀匹配，同时覆盖 /admin 本身与 /admin-login；
// 单独列出 /admin-login 是为了明确意图，防止将来 /admin 规则被收窄后漏拦
const DISALLOW_PATHS = ["/admin", "/admin-login", "/api/"];

// AI 爬虫全开：搜索、引用、训练均允许；仍屏蔽后台与 API。
// 包含中文搜索/AI 爬虫，避免被 CDN/边缘策略误伤。
// 其余未列出的爬虫由 "*" 组允许。
const AI_ALLOWED_BOTS = [
  // AI 搜索 / 引用
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Perplexity-User",
  "Claude-User",
  "Claude-SearchBot",
  "Google-Extended",
  "Bytespider",
  // 中文搜索 / AI
  "Baiduspider",
  "Baiduspider-render",
  "KimiBot",
  "PetalBot",
  // AI 训练
  "GPTBot",
  "ClaudeBot",
  "CCBot",
  "Applebot-Extended",
  "meta-externalagent",
  "Amazonbot",
];

// Content Signals 声明，与上面的全开策略保持一致：
// 允许训练（ai-train=yes）、搜索索引（search=yes）与 AI 搜索引用（ai-input=yes）
// 规范见 https://contentsignals.org/
const CONTENT_SIGNAL = {
  "Content-Signal": "ai-train=yes, search=yes, ai-input=yes",
};

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // 不拦截 /_next/：Bing 等无专属分组的爬虫需要抓取 CSS/JS 才能正确渲染页面
        // 百度系爬虫（Baiduspider / Baiduspider-render）同样适用本组规则；
        // 百度不支持 Crawl-delay，抓取压力需在百度搜索资源平台后台调整
        disallow: DISALLOW_PATHS,
        other: CONTENT_SIGNAL,
      },
      {
        userAgent: AI_ALLOWED_BOTS,
        allow: "/",
        disallow: DISALLOW_PATHS,
        other: CONTENT_SIGNAL,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
