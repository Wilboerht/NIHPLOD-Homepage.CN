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

// AI 搜索 / 引用类爬虫：允许抓取，内容可被 AI 搜索引用。
// - Google-Extended 不是爬虫，而是谷歌"是否允许内容用于 Gemini/Vertex AI"的控制令牌；
//   放开它有利于 Gemini 引用本站内容。
// - Bytespider（字节/豆包）同时承担搜索与训练，为中文 AI 搜索曝光放开；
//   如抓取压力大，请在 Nginx/WAF 层做频率限制，而不是用 robots 一刀切。
const AI_SEARCH_BOTS = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Perplexity-User",
  "Claude-User",
  "Claude-SearchBot",
  "Google-Extended",
  "Bytespider",
];

// AI 训练类爬虫：继续屏蔽，不允许内容用于模型训练
const AI_TRAINING_BOTS = [
  "GPTBot",
  "ClaudeBot",
  "CCBot",
  "Applebot-Extended",
  "meta-externalagent",
  "Amazonbot",
];

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
      },
      {
        userAgent: AI_SEARCH_BOTS,
        allow: "/",
        disallow: DISALLOW_PATHS,
      },
      {
        userAgent: AI_TRAINING_BOTS,
        disallow: "/",
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
