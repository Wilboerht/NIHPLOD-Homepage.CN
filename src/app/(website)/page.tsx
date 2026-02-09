import HomeClient from "@/components/website/HomeClient";
import prisma from "@/lib/prisma";
import type { HomePageContent } from "@/types/page-content";

// ISR: 首页每小时重新验证一次
export const revalidate = 3600;

/**
 * 首页 - 简洁品牌布局
 * 双入口：AI 护肤顾问 + 产品浏览
 */
export default async function Home() {
  // 从数据库获取首页内容
  let content: HomePageContent | undefined;

  try {
    const page = await prisma.page.findUnique({
      where: { slug: "home" },
      select: { content: true, published: true },
    });

    if (page?.published) {
      if (page.content) {
        content = page.content as unknown as HomePageContent;
      }
    }
  } catch (error) {
    console.error("获取首页内容失败:", error);
  }

  return <HomeClient content={content} />;
}

