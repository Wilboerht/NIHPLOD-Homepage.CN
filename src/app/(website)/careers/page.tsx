import { Metadata } from "next";
import prisma from "@/lib/prisma";
import { CareersContent } from "./CareersContent";
import type { CareersPageContent } from "@/types/page-content";

// ISR: 招聘页面每小时重新验证一次
export const revalidate = 3600; // 1小时

export const metadata: Metadata = {
  title: "加入我们",
  description:
    "加入 NIHPLOD 旎柏，与我们一起创造高端护肤的未来。探索上海与摩纳哥的职位机会。",
  openGraph: {
    title: "加入我们 | NIHPLOD 旎柏",
    description:
      "加入 NIHPLOD 旎柏，与我们一起创造高端护肤的未来。探索上海与摩纳哥的职位机会。",
  },
  twitter: {
    card: "summary",
    title: "加入我们 | NIHPLOD 旎柏",
    description: "加入 NIHPLOD 旎柏，与我们一起创造高端护肤的未来。",
  },
};

// 职位类型
interface Job {
  id: string;
  title: string;
  titleEn: string;
  location: string;
  type: string;
  description: string;
  requirements: string;
  salary: string | null;
}

async function getJobs(): Promise<Job[]> {
  const jobs = await prisma.job.findMany({
    where: { published: true },
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      titleEn: true,
      location: true,
      type: true,
      description: true,
      requirements: true,
      salary: true,
    },
  });

  return jobs;
}

async function getPageData(): Promise<{ content?: CareersPageContent; backgroundImage?: string }> {
  try {
    const page = await prisma.page.findUnique({
      where: { slug: "careers" },
      select: { content: true, published: true, backgroundImage: true },
    });

    if (page?.published) {
      return {
        content: page.content as unknown as CareersPageContent,
        backgroundImage: page.backgroundImage || undefined,
      };
    }
  } catch (error) {
    console.error("获取加入我们页面内容失败:", error);
  }
  return {};
}

export default async function CareersPage() {
  const [jobs, pageData] = await Promise.all([getJobs(), getPageData()]);
  return <CareersContent jobs={jobs} content={pageData.content} backgroundImage={pageData.backgroundImage} />;
}
