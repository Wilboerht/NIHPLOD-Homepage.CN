import { Metadata } from "next";
import { ServicesContent } from "./ServicesContent";
import { BreadcrumbJsonLd } from "@/components/seo/JsonLd";
import type { ServicesPageContent } from "@/types/page-content";

// 默认内容（fallback）
const defaultContent: ServicesPageContent = {
  pageTitle: { en: "SERVICES", zh: "服务入口" },
  services: [
    {
      id: "auth",
      label: "授权验真",
      title: "授权验真系统",
      nameEn: "Authorization Verification",
      description: "NIHPLOD 旎柏产品授权查询与真伪验证平台，提供官方授权验证服务。",
      links: [
        {
          label: "用户端",
          url: "https://ba.nihplod.cn",
          isAdmin: false,
          description: "授权查询、真伪验证",
        },
        {
          label: "管理端",
          url: "https://ba.nihplod.cn/admin",
          isAdmin: true,
          description: "仅授权人员使用",
        },
      ],
    },
    {
      id: "influencer",
      label: "达人平台",
      title: "达人合作平台",
      nameEn: "Influencer Platform",
      description: "KOL/KOC合作平台，提供达人招募、内容共创、合作管理等功能。",
      links: [
        {
          label: "用户端",
          url: "https://influencer.nihplod.cn",
          isAdmin: false,
          description: "达人注册、合作申请、任务领取",
        },
        {
          label: "管理端",
          url: "https://influencer.nihplod.cn/admin",
          isAdmin: true,
          description: "仅授权人员使用",
        },
      ],
    },
    {
      id: "miniprogram",
      label: "微信小程序",
      title: "NIHPLOD 微信小程序",
      nameEn: "WeChat Mini Program",
      description: "微信小程序，提供便捷的产品浏览与购物体验，敬请期待。",
      links: [
        {
          label: "用户端",
          url: "#",
          isAdmin: false,
          description: "暂未上线",
        },
      ],
    },
  ],
};

export const metadata: Metadata = {
  title: "服务入口",
  description:
    "NIHPLOD 旎柏，源自摩纳哥的专业护肤品牌，通过前沿科技与珍贵成分，致力于打造简单、高效的护肤体验。",
  alternates: {
    canonical: "/services",
  },
  openGraph: {
    title: "服务入口 | NIHPLOD 旎柏",
    description: "NIHPLOD 旎柏服务平台——专属权益，一站即达。",
    images: ["/images/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "服务入口 | NIHPLOD 旎柏",
    description: "NIHPLOD 旎柏服务平台——专属权益，一站即达。",
    images: ["/images/og-image.png"],
  },
  robots: {
    index: false, // 服务入口页面不需要被索引
  },
};

export default function ServicesPage() {
  const breadcrumbs = [
    { name: "首页", url: "/" },
    { name: "服务入口", url: "/services" },
  ];

  return (
    <>
      <BreadcrumbJsonLd items={breadcrumbs} />
      <ServicesContent content={defaultContent} />
    </>
  );
}
