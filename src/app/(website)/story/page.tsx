import { Metadata } from "next";
import { StoryContent } from "./StoryContent";
import prisma from "@/lib/prisma";

// ISR: 品牌故事页面每天重新验证一次
export const revalidate = 86400; // 24小时

export const metadata: Metadata = {
  title: "品牌故事",
  description:
    "探索 NIHPLOD 旎柏的品牌故事，源自摩纳哥的高端护肤理念，融合东方智慧与西方科技。",
  openGraph: {
    title: "品牌故事 | NIHPLOD 旎柏",
    description:
      "探索 NIHPLOD 旎柏的品牌故事，源自摩纳哥的高端护肤理念，融合东方智慧与西方科技。",
    images: ["/images/story-og.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "品牌故事 | NIHPLOD 旎柏",
    description: "探索 NIHPLOD 旎柏的品牌故事，源自摩纳哥的高端护肤理念。",
    images: ["/images/story-og.jpg"],
  },
};

async function getPageData(): Promise<{ backgroundImage?: string }> {
  try {
    const page = await prisma.page.findUnique({
      where: { slug: "story" },
      select: { published: true, backgroundImage: true },
    });

    if (page?.published) {
      return {
        backgroundImage: page.backgroundImage || undefined,
      };
    }
  } catch (error) {
    console.error("获取品牌故事页面数据失败:", error);
  }
  return {};
}

export default async function StoryPage() {
  const pageData = await getPageData();
  return <StoryContent backgroundImage={pageData.backgroundImage} />;
}
