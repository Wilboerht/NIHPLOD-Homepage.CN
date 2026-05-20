import { Metadata } from "next";
import { RitualContent } from "./RitualContent";


// ISR: 护肤仪式页面每60秒重新验证一次
export const revalidate = 60;

export const metadata: Metadata = {
  title: "护肤仪式与指南 | NIHPLOD 旎柏——摩纳哥高端护肤品牌",
  description:
    "探索 NIHPLOD 旎柏专属护肤仪式与官方使用指南。了解真脂质体修护面霜、焕活身体乳等高端产品的正确使用方法、晨间与晚间护肤步骤及科学护肤理念。",
  keywords: [
    "NIHPLOD", "旎柏", "护肤仪式", "护肤指南", "护肤步骤",
    "修护面霜用法", "焕活身体乳用法", "晨间护肤", "晚间护肤",
    "科学护肤", "脂质体护肤方法", "高端护肤品使用"
  ],
  openGraph: {
    title: "护肤仪式 | NIHPLOD 旎柏",
    description:
      "每一次护肤，都是与自己对话的珍贵时光。探索 NIHPLOD 旎柏专属晨间与晚间护肤仪式。",
    images: ["/images/ritual-og.jpg"],
  },
  twitter: {
    card: "summary",
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
