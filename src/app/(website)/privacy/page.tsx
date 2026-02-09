import { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { PrivacyContent } from "./PrivacyContent";

// ISR: 隐私政策页面每天重新验证一次
export const revalidate = 86400; // 24小时

// 获取页面数据
async function getPageData(): Promise<void> {
  try {
    const page = await prisma.page.findUnique({
      where: { slug: "privacy" },
      select: { published: true },
    });

    if (page?.published) {
      return;
    }
  } catch (error) {
    console.error("Failed to fetch privacy page data:", error);
  }

  return;
}

export const metadata: Metadata = {
  title: "隐私政策",
  description: "了解 NIHPLOD 旎柏如何收集、使用和保护您的个人信息。",
  openGraph: {
    title: "隐私政策 | NIHPLOD 旎柏",
    description: "了解 NIHPLOD 旎柏如何收集、使用和保护您的个人信息。",
  },
  twitter: {
    card: "summary",
    title: "隐私政策 | NIHPLOD 旎柏",
    description: "了解 NIHPLOD 旎柏如何收集、使用和保护您的个人信息。",
  },
  robots: {
    index: false, // 隐私政策页面通常不需要被索引
  },
};

export default async function PrivacyPage() {
  await getPageData();
  return <PrivacyContent />;
}
