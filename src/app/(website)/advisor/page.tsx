import { Suspense } from "react";
import { Metadata } from "next";
import prisma from "@/lib/prisma";
import { AdvisorWelcome } from "./AdvisorWelcome";

export const metadata: Metadata = {
  title: "AI 护肤顾问",
  description: "通过 AI 智能分析，获取专属于您的个性化护肤方案。NIHPLOD 旎柏 AI 护肤顾问，科技赋能美丽。",
  openGraph: {
    title: "AI 护肤顾问 | NIHPLOD 旎柏",
    description: "通过 AI 智能分析，获取专属于您的个性化护肤方案。NIHPLOD 旎柏 AI 护肤顾问，科技赋能美丽。",
    images: ["/images/advisor-og.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI 护肤顾问 | NIHPLOD 旎柏",
    description: "通过 AI 智能分析，获取专属于您的个性化护肤方案。",
    images: ["/images/advisor-og.jpg"],
  },
};

// ISR: 顾问页每60秒重新验证一次
export const revalidate = 60;

/**
 * 获取页面背景图片
 */
async function getPageData(): Promise<{ backgroundImage?: string }> {
  try {
    const page = await prisma.page.findUnique({
      where: { slug: "advisor" },
      select: { published: true, backgroundImage: true },
    });

    if (page?.published) {
      return {
        backgroundImage: page.backgroundImage || undefined,
      };
    }
  } catch (error) {
    console.error("获取顾问页面数据失败:", error);
  }
  return {};
}

/**
 * AI 护肤顾问页面
 * Server Component - 数据获取
 */
export default async function AdvisorPage() {
  const pageData = await getPageData();

  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-brand-cream">
          <div className="text-brand-charcoal/50">加载中...</div>
        </div>
      }
    >
      <AdvisorWelcome backgroundImage={pageData.backgroundImage} />
    </Suspense>
  );
}
