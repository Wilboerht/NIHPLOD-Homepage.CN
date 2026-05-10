/**
 * 站点地图生成
 * Next.js 会自动在 /sitemap.xml 生成 XML 格式的站点地图
 * 文档: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 */
import { MetadataRoute } from "next";
import prisma from "@/lib/prisma";

// 基础 URL
const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://nihplod.cn";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 静态页面
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/products`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/guide`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/careers`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  // 动态产品页面
  let productPages: MetadataRoute.Sitemap = [];

  try {
    const products = await prisma.product.findMany({
      where: { published: true },
      select: { slug: true, updatedAt: true },
    });

    productPages = products.map((product) => ({
      url: `${baseUrl}/products/${product.slug}`,
      lastModified: product.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
  } catch (error) {
    // 数据库连接失败时仅返回静态页面
    console.error("Sitemap: Failed to fetch products:", error);
  }

  return [...staticPages, ...productPages];
}

