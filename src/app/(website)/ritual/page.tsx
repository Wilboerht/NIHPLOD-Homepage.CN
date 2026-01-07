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

export default async function RitualPage() {
  let backgroundImage: string | undefined;

  try {
    const page = await prisma.page.findUnique({
      where: { slug: "ritual" },
      select: { published: true, backgroundImage: true },
    });

    // 只有在页面已发布时才使用配置的背景图
    if (page?.published && page.backgroundImage) {
      backgroundImage = page.backgroundImage;
    }
  } catch (error) {
    console.error("获取护肤仪式页面数据失败:", error);
  }

  return <RitualContent backgroundImage={backgroundImage} />;
}
