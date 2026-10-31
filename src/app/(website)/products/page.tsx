import { Metadata } from "next";
import prisma from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";
import { ProductsContent } from "./ProductsContent";
import { ItemListJsonLd } from "@/components/seo/JsonLd";
import { getVisibleCategories } from "./queries";
import { mockProducts } from "./mock-data";

// ISR: 产品列表页每60秒重新验证一次
export const revalidate = 60;

// 开发环境无本地数据库时的 Mock 降级分支（仅限 NODE_ENV=development）：
// 生产构建时该常量为 false，分支会被构建工具死代码消除，
// mock-data.ts 不会进入生产包。如需彻底移除，请同步处理 [slug]/page.tsx。
const isDev = process.env.NODE_ENV === "development";

export const metadata: Metadata = {
  title: "产品系列",
  description:
    "NIHPLOD 旎柏全线产品系列：抗衰老面霜、修护精华、焕活身体乳等高端护肤产品，以真脂质体专利技术（Dolphin-Skin）驱动，简单高效，科学呵护肌肤。",
  alternates: {
    canonical: "/products",
    languages: {
      "zh-CN": "/products",
    },
  },
  keywords: [
    "NIHPLOD",
    "旎柏",
    "产品系列",
    "高端护肤产品",
    "摩纳哥护肤品",
    "真脂质体科技",
    "抗衰老产品",
    "科学护肤",
  ],
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: "/products",
    siteName: "NIHPLOD 旎柏",
    title: "产品系列 | NIHPLOD 旎柏",
    description: "NIHPLOD 旎柏全线产品系列，以真脂质体科技为核心，致力于打造简单、高效的护肤体验。",
    images: [
      {
        url: "/images/og-image.png",
        width: 1200,
        height: 630,
        alt: "NIHPLOD 旎柏产品系列",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@nihplod",
    creator: "@nihplod",
    title: "产品系列 | NIHPLOD 旎柏",
    description: "NIHPLOD 旎柏全线产品系列，以真脂质体科技为核心，致力于打造简单、高效的护肤体验。",
    images: ["/images/og-image.png"],
  },
};

/**
 * 获取已发布的产品
 */
async function getProducts() {
  if (isDev) {
    apiConsole.info("[Products] DEV 使用 Mock 产品数据");
    return mockProducts;
  }

  try {
    const products = await prisma.product.findMany({
      // 分类隐藏时其商品在全站不可见（列表/详情/sitemap/搜索一致）
      where: { published: true, category: { visible: true } },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      take: 200,
      select: {
        id: true,
        name: true,
        slug: true,
        price: true,
        capacity: true,
        category: {
          select: { name: true },
        },
        images: {
          orderBy: { order: "asc" },
          take: 1,
          select: { url: true, alt: true },
        },
      },
    });

    // 转换 Decimal 为 number
    return products.map((p) => ({
      ...p,
      price: Number(p.price),
    }));
  } catch (error) {
    apiConsole.error("获取产品列表失败:", error);
    throw error;
  }
}

/**
 * 产品列表页
 * Server Component - 数据获取
 */
export default async function ProductsPage() {
  const [categories, products] = await Promise.all([getVisibleCategories(), getProducts()]);

  const itemList = products.map((product) => ({
    name: product.name,
    url: `/products/${product.slug}`,
    image: product.images[0]?.url,
  }));

  return (
    <>
      <ItemListJsonLd name="NIHPLOD 旎柏产品系列" url="/products" items={itemList} />
      <ProductsContent categories={categories} products={products} />
    </>
  );
}
