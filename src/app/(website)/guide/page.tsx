import { Metadata } from "next";
import { RitualContent } from "./RitualContent";
import { BreadcrumbJsonLd } from "@/components/seo/JsonLd";

// ISR: 护肤仪式页面每60秒重新验证一次
export const revalidate = 60;

export const metadata: Metadata = {
  title: "护肤仪式与指南",
  description:
    "NIHPLOD 旎柏，是源自摩纳哥的专业护肤品牌，通过前沿科技与珍贵成分，致力于为高净值人士打造简单、高效的护肤体验。",
  keywords: [
    "NIHPLOD",
    "旎柏",
    "护肤仪式",
    "护肤指南",
    "护肤步骤",
    "修护面霜用法",
    "焕活身体乳用法",
    "晨间护肤",
    "晚间护肤",
    "科学护肤",
    "脂质体护肤方法",
    "高端护肤品使用",
  ],
  alternates: {
    canonical: "/guide",
  },
  openGraph: {
    title: "护肤仪式 | NIHPLOD 旎柏",
    description:
      "NIHPLOD 旎柏，是源自摩纳哥的专业护肤品牌，通过前沿科技与珍贵成分，致力于为高净值人士打造简单、高效的护肤体验。",
    images: ["/images/og-image.png"],
  },
  twitter: {
    card: "summary",
    title: "护肤仪式 | NIHPLOD 旎柏",
    description:
      "NIHPLOD 旎柏，是源自摩纳哥的专业护肤品牌，通过前沿科技与珍贵成分，致力于为高净值人士打造简单、高效的护肤体验。",
    images: ["/images/og-image.png"],
  },
};

import prisma from "@/lib/prisma";

// ...

// 获取已发布的产品
async function getProducts() {
  try {
    const products = await prisma.product.findMany({
      where: { published: true },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      include: {
        category: {
          select: { id: true, name: true, nameEn: true, slug: true },
        },
        images: {
          orderBy: { order: "asc" },
          select: { url: true, alt: true },
        },
        purchaseLinks: {
          orderBy: { order: "asc" },
          select: { id: true, platform: true, url: true },
        },
      },
    });

    // 转换 Decimal 为 number，并将 null 转换为 undefined
    return products.map((p) => ({
      ...p,
      price: Number(p.price),
      capacity: p.capacity ?? undefined,
      purchaseUrl: p.purchaseUrl ?? undefined,
      ingredients: p.ingredients ?? undefined,
      usage: p.usage ?? undefined,
      images: p.images.map((img) => ({
        ...img,
        alt: img.alt ?? undefined,
      })),
    }));
  } catch (error) {
    console.error("获取产品列表失败:", error);
    return [];
  }
}

export default async function RitualPage() {
  const breadcrumbs = [
    { name: "首页", url: "/" },
    { name: "护肤仪式与指南", url: "/guide" },
  ];

  // 并行获取数据
  const [products] = await Promise.all([getProducts()]);

  // 只有在页面已发布时才使用配置的背景图

  return (
    <>
      <BreadcrumbJsonLd items={breadcrumbs} />
      <RitualContent products={products} />
    </>
  );
}
