import { Suspense } from "react";
import { Metadata } from "next";
import prisma from "@/lib/prisma";
import { ProductsContent } from "./ProductsContent";

export const metadata: Metadata = {
  title: "产品系列 | NIHPLOD 旎柏",
  description: "探索 NIHPLOD 旎柏高端护肤产品系列，源自摩纳哥的奢华护肤体验",
  openGraph: {
    title: "产品系列 | NIHPLOD 旎柏",
    description: "探索 NIHPLOD 旎柏高端护肤产品系列，源自摩纳哥的奢华护肤体验",
  },
};

/**
 * 获取所有分类
 */
async function getCategories() {
  const categories = await prisma.category.findMany({
    orderBy: { order: "asc" },
    select: {
      id: true,
      name: true,
      nameEn: true,
      slug: true,
    },
  });
  return categories;
}

/**
 * 获取已发布的产品
 */
async function getProducts() {
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
    },
  });

  // 转换 Decimal 为 number
  return products.map((p) => ({
    ...p,
    price: Number(p.price),
  }));
}

/**
 * 产品列表页
 * Server Component - 数据获取
 */
export default async function ProductsPage() {
  const [categories, products] = await Promise.all([
    getCategories(),
    getProducts(),
  ]);

  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-brand-cream">
          <div className="text-brand-charcoal/50">加载中...</div>
        </div>
      }
    >
      <ProductsContent categories={categories} products={products} />
    </Suspense>
  );
}
