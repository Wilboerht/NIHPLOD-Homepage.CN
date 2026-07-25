import { Suspense } from "react";
import { Metadata } from "next";
import prisma from "@/lib/prisma";
import { ProductsContent } from "./ProductsContent";
import { BreadcrumbJsonLd } from "@/components/seo/JsonLd";
import { mockCategories, mockProducts } from "./mock-data";

// ISR: 产品列表页每60秒重新验证一次
export const revalidate = 60;

const isDev = process.env.NODE_ENV === "development";

export const metadata: Metadata = {
  title: "产品系列",
  description:
    "NIHPLOD 旎柏，源自摩纳哥的专业护肤品牌，通过前沿科技与珍贵成分，致力于打造简单、高效的护肤体验。",
  alternates: {
    canonical: "/products",
  },
  keywords: [
    "NIHPLOD",
    "旎柏",
    "产品系列",
    "高端护肤产品",
    "修护面霜",
    "焕活身体乳",
    "洁面慕斯",
    "保湿精华",
    "摩纳哥护肤品",
    "奢侈护肤品",
    "抗衰老产品",
  ],
  openGraph: {
    title: "产品系列 | NIHPLOD 旎柏",
    description:
      "NIHPLOD 旎柏全线产品系列，以真脂质体科技为核心，致力于打造简单、高效的护肤体验。",
    images: ["/images/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "产品系列 | NIHPLOD 旎柏",
    description:
      "NIHPLOD 旎柏全线产品系列，以真脂质体科技为核心，致力于打造简单、高效的护肤体验。",
    images: ["/images/og-image.png"],
  },
};

/**
 * 获取所有可见的分类
 */
async function getCategories() {
  if (isDev) {
    console.log("🔧 [DEV] 使用 Mock 分类数据");
    return mockCategories;
  }

  try {
    const categories = await prisma.category.findMany({
      where: { visible: true }, // 只获取在前台展示的分类
      orderBy: { order: "asc" },
      select: {
        id: true,
        name: true,
        nameEn: true,
        slug: true,
        icon: true,
      },
    });
    return categories;
  } catch (error) {
    console.error("获取分类列表失败:", error);
    return [];
  }
}

/**
 * 获取已发布的产品
 */
async function getProducts() {
  if (isDev) {
    console.log("🔧 [DEV] 使用 Mock 产品数据");
    return mockProducts;
  }

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

    // 转换 Decimal 为 number
    return products.map((p) => ({
      ...p,
      price: Number(p.price),
    }));
  } catch (error) {
    console.error("获取产品列表失败:", error);
    return [];
  }
}

/**
 * 产品列表页
 * Server Component - 数据获取
 */
export default async function ProductsPage() {
  const [categories, products] = await Promise.all([getCategories(), getProducts()]);

  const breadcrumbs = [
    { name: "首页", url: "/" },
    { name: "产品系列", url: "/products" },
  ];

  return (
    <>
      <BreadcrumbJsonLd items={breadcrumbs} />
      <Suspense
        fallback={
          <div className="flex h-dvh items-center justify-center bg-brand-cream">
            <div className="text-brand-charcoal/50">加载中...</div>
          </div>
        }
      >
        <ProductsContent categories={categories} products={products} />
      </Suspense>
    </>
  );
}
