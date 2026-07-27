import { Metadata } from "next";
import prisma from "@/lib/prisma";
import { CareersContent, Job } from "./CareersContent";
import { BreadcrumbJsonLd, JobPostingJsonLd } from "@/components/seo/JsonLd";

// ISR: 招聘页面每小时重新验证一次
export const revalidate = 3600; // 1小时

export const metadata: Metadata = {
  title: "加入我们",
  description:
    "NIHPLOD 旎柏，源自摩纳哥的专业护肤品牌，通过前沿科技与珍贵成分，致力于打造简单、高效的护肤体验。",
  alternates: {
    canonical: "/careers",
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
    title: "加入我们 | NIHPLOD 旎柏",
    description:
      "加入 NIHPLOD 旎柏——与我们一起，逆转时光。",
    images: ["/images/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "加入我们 | NIHPLOD 旎柏",
    description:
      "加入 NIHPLOD 旎柏——与我们一起，逆转时光。",
    images: ["/images/og-image.png"],
  },
};

import Script from "next/script";

// 高德地图 Key 与 安全密钥从环境变量读取（服务端环境变量，不会暴露到客户端 JS bundle）
const AMAP_KEY = process.env.AMAP_KEY;
const AMAP_SECRET = process.env.AMAP_SECRET;

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
      },
    });
    return jobs;
  } catch (error) {
    console.error("获取职位列表失败:", error);
    return [];
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
      {/* 预加载高德地图配置 */}
      <Script
        id="amap-security-config"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window._AMapSecurityConfig = {
              securityJsCode: '${AMAP_SECRET}'
            };
          `,
        }}
      />
      {/* 预加载高德地图脚本 */}
      <Script
        src={`https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}&plugin=AMap.Geocoder`}
        strategy="afterInteractive"
      />
      <CareersContent jobs={jobs} content={undefined} />
    </>
  );
}
