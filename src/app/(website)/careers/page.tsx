import { Metadata } from "next";
import prisma from "@/lib/prisma";
import { CareersContent, Job } from "./CareersContent";
import { BreadcrumbJsonLd, JobPostingJsonLd } from "@/components/seo/JsonLd";

// ISR: 招聘页面每小时重新验证一次
export const revalidate = 3600; // 1小时

export const metadata: Metadata = {
  title: "加入我们",
  description:
    "加入 NIHPLOD 旎柏：源自摩纳哥的高端护肤品牌诚聘品牌运营、电商、市场等岗位人才。与专注美好的团队一起，逆转时光。",
  authors: [{ name: "NIHPLOD 官方" }],
  alternates: {
    canonical: "/careers",
    languages: {
      "zh-CN": "/careers",
      "x-default": "/careers",
    },
  },
  keywords: [
    "NIHPLOD",
    "旎柏",
    "招聘",
    "加入我们",
    "工作机会",
    "高端护肤品牌招聘",
    "上海招聘",
    "摩纳哥招聘",
    "护肤品行业",
  ],
  openGraph: {
    url: "/careers",
    title: "加入我们 | NIHPLOD 旎柏",
    description: "加入 NIHPLOD 旎柏——与我们一起，逆转时光。",
    images: [
      {
        url: "/images/og-image.png",
        width: 1200,
        height: 630,
        alt: "加入 NIHPLOD 旎柏",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "加入我们 | NIHPLOD 旎柏",
    description: "加入 NIHPLOD 旎柏——与我们一起，逆转时光。",
    images: ["/images/og-image.png"],
  },
};

import { getPublicAmapConfig } from "@/lib/amap-public";

// 高德地图 Key 从环境变量读取（服务端环境变量，不会暴露到客户端 JS bundle）
const publicAmap = getPublicAmapConfig();
const AMAP_KEY = publicAmap.key;
const AMAP_ENABLED = Boolean(publicAmap.key && publicAmap.secret);

async function getJobs(): Promise<Job[]> {
  try {
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
        longitude: true,
        latitude: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return jobs;
  } catch (error) {
    console.error("获取职位列表失败:", error);
    // 构建阶段数据库不可达时返回空列表，避免 next build 因连接超时长时间卡住。
    if (process.env.NEXT_PHASE === "phase-production-build") {
      return [];
    }
    throw error;
  }
}

export default async function CareersPage() {
  const jobs = await getJobs();
  const breadcrumbs = [
    { name: "首页", url: "/" },
    { name: "加入我们", url: "/careers" },
  ];

  return (
    <>
      <BreadcrumbJsonLd items={breadcrumbs} />
      {jobs.map((job) => (
        <JobPostingJsonLd key={job.id} job={job} />
      ))}
      <CareersContent
        jobs={jobs}
        content={undefined}
        amapEnabled={AMAP_ENABLED}
        amapKey={AMAP_KEY}
        amapSecurityCode={publicAmap.secret}
      />
    </>
  );
}
