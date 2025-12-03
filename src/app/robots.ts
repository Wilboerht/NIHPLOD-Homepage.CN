/**
 * Robots.txt 生成
 * Next.js 会自动在 /robots.txt 生成规则文件
 * 文档: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
 */
import { MetadataRoute } from "next";

// 基础 URL
const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://nihplod.cn";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",        // 管理后台
          "/admin/*",      // 管理后台所有子路径
          "/api/",         // API 接口
          "/api/*",        // API 所有子路径
          "/_next/",       // Next.js 内部资源
          "/advisor/analyzing", // 分析中页面（无需索引）
          "/advisor/result",    // 结果页面（个性化内容）
        ],
      },
      {
        // 百度爬虫特殊规则
        userAgent: "Baiduspider",
        allow: "/",
        disallow: [
          "/admin",
          "/admin/*",
          "/api/",
          "/api/*",
        ],
        crawlDelay: 1, // 爬取间隔 1 秒
      },
      {
        // 谷歌爬虫特殊规则
        userAgent: "Googlebot",
        allow: "/",
        disallow: [
          "/admin",
          "/admin/*",
          "/api/",
          "/api/*",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}

