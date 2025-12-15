import { Metadata } from "next";
import { RitualContent } from "./RitualContent";
import prisma from "@/lib/prisma";
import type { RitualPageContent } from "@/types/page-content";

// ISR: 护肤仪式页面每天重新验证一次
export const revalidate = 86400; // 24小时

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

async function getPageData(): Promise<{ content?: RitualPageContent; backgroundImage?: string }> {
  try {
    const page = await prisma.page.findUnique({
      where: { slug: "ritual" },
      select: { content: true, published: true, backgroundImage: true },
    });

    if (page?.published) {
      return {
        content: page.content as unknown as RitualPageContent,
        backgroundImage: page.backgroundImage || undefined,
      };
    }
  } catch (error) {
    console.error("获取护肤仪式页面内容失败:", error);
  }
  return {};
}

export default async function RitualPage() {
  const pageData = await getPageData();
  return <RitualContent content={pageData.content} backgroundImage={pageData.backgroundImage} />;
}
