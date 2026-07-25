import { Metadata } from "next";
import { Suspense } from "react";
import { RitualContent } from "./RitualContent";
import { BreadcrumbJsonLd, GuideHowToJsonLd } from "@/components/seo/JsonLd";
import { defaultModuleData, modules } from "./guide-data";

// ISR: 护肤仪式页面每60秒重新验证一次
export const revalidate = 60;

export const metadata: Metadata = {
  title: "护肤仪式与指南",
  description:
    "NIHPLOD 旎柏，源自摩纳哥的专业护肤品牌，通过前沿科技与珍贵成分，致力于打造简单、高效的护肤体验。",
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
      "NIHPLOD 旎柏护肤仪式指南——简单，从不妥协。",
    images: ["/images/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "护肤仪式 | NIHPLOD 旎柏",
    description:
      "NIHPLOD 旎柏护肤仪式指南——简单，从不妥协。",
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

  // 所有方案的分步指南（供 HowTo 结构化数据：Level 3 内容在客户端按层级渲染，
  // 不在初始 HTML 中，通过 JSON-LD 让搜索引擎可抓取）
  const moduleLabels = new Map(modules.map((m) => [m.id, m.label]));
  const howToGuides = Object.entries(defaultModuleData).flatMap(([moduleId, schemes]) => {
    const moduleLabel = moduleLabels.get(moduleId as keyof typeof defaultModuleData) ?? "";
    return schemes.flatMap((scheme) => {
      if (scheme.subPlans && scheme.subPlans.length > 0) {
        return scheme.subPlans
          .filter((subPlan) => subPlan.steps.length > 0)
          .map((subPlan) => ({
            name: `${moduleLabel} · ${scheme.name} · ${subPlan.name}`,
            description: scheme.desc,
            steps: subPlan.steps,
          }));
      }
      return scheme.steps.length > 0
        ? [{ name: `${moduleLabel} · ${scheme.name}`, description: scheme.desc, steps: scheme.steps }]
        : [];
    });
  });

  return (
    <>
      <BreadcrumbJsonLd items={breadcrumbs} />
      <GuideHowToJsonLd guides={howToGuides} />
      {/* useSearchParams 需要在 Suspense 边界内（与 contact 页一致） */}
      <Suspense fallback={null}>
        <RitualContent products={products} />
      </Suspense>
    </>
  );
}
