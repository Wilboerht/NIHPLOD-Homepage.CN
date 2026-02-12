import { Metadata } from "next";
import { RitualContent } from "./RitualContent";


// ISR: 护肤仪式页面每60秒重新验证一次
export const revalidate = 60;

export const metadata: Metadata = {
  title: "护肤仪式",
  description:
    "每一次护肤，都是与自己对话的珍贵时光。探索 NIHPLOD 旎柏专属晨间与晚间护肤仪式。",
  openGraph: {
    title: "护肤仪式 | NIHPLOD 旎柏",
    description:
      "每一次护肤，都是与自己对话的珍贵时光。探索 NIHPLOD 旎柏专属晨间与晚间护肤仪式。",
    images: ["/images/ritual-og.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "护肤仪式 | NIHPLOD 旎柏",
    description: "每一次护肤，都是与自己对话的珍贵时光。探索专属晨间与晚间护肤仪式。",
    images: ["/images/ritual-og.jpg"],
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


  // 并行获取数据
  const [products] = await Promise.all([
    getProducts(),
  ]);

  // 只有在页面已发布时才使用配置的背景图

  return <RitualContent products={products} />;
}
