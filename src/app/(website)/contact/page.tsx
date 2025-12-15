import { Metadata } from "next";
import prisma from "@/lib/prisma";
import { ContactContent } from "./ContactContent";
import type { ContactPageContent } from "@/types/page-content";

// ISR: 联系我们页面每天重新验证一次
export const revalidate = 86400; // 24小时

export const metadata: Metadata = {
  title: "联系我们",
  description: "有任何问题或建议？欢迎联系 NIHPLOD 旎柏，我们期待与您的每一次交流。",
  openGraph: {
    title: "联系我们 | NIHPLOD 旎柏",
    description: "有任何问题或建议？欢迎联系 NIHPLOD 旎柏，我们期待与您的每一次交流。",
  },
  twitter: {
    card: "summary",
    title: "联系我们 | NIHPLOD 旎柏",
    description: "有任何问题或建议？欢迎联系 NIHPLOD 旎柏。",
  },
};

async function getPageData(): Promise<{ content?: ContactPageContent; backgroundImage?: string }> {
  try {
    const page = await prisma.page.findUnique({
      where: { slug: "contact" },
      select: { content: true, published: true, backgroundImage: true },
    });

    if (page?.published) {
      return {
        content: page.content as unknown as ContactPageContent,
        backgroundImage: page.backgroundImage || undefined,
      };
    }
  } catch (error) {
    console.error("获取联系我们页面内容失败:", error);
  }
  return {};
}

export default async function ContactPage() {
  const pageData = await getPageData();
  return <ContactContent content={pageData.content} backgroundImage={pageData.backgroundImage} />;
}
