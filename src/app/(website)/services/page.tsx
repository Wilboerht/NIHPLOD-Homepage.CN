import { Metadata } from "next";
import { ServicesContent } from "./ServicesContent";
import { BreadcrumbJsonLd } from "@/components/seo/JsonLd";
import type { ServicesPageContent } from "@/types/page-content";

// 默认内容（fallback）
const defaultContent: ServicesPageContent = {
  pageTitle: { en: "SERVICES", zh: "服务入口" },
  services: [
    {
      id: "vip",
      label: "会员系统",
      title: "旎柏会员系统",
      nameEn: "VIP System",
      description: "会员积分、权益管理与专属服务平台，为尊贵会员提供积分查询、等级权益、专属优惠等服务。",
      links: [
        { label: "用户端", url: "https://vip.nihplod.cn", isAdmin: false, description: "会员登录、积分查询、权益兑换" },
        { label: "管理端", url: "https://adminvip.nihplod.cn", isAdmin: true, description: "仅授权人员使用" },
      ],
    },
    {
      id: "auth",
      label: "授权验真",
      title: "授权验真系统",
      nameEn: "Authorization Verification",
      description: "NIHPLOD 旎柏产品授权查询与真伪验证平台，提供官方授权验证服务。",
      links: [
        { label: "用户端", url: "https://ba.nihplod.cn", isAdmin: false, description: "授权查询、真伪验证" },
        { label: "管理端", url: "https://ba.nihplod.cn/admin", isAdmin: true, description: "仅授权人员使用" },
      ],
    },
    {
      id: "influencer",
      label: "达人平台",
      title: "达人合作平台",
      nameEn: "Influencer Platform",
      description: "KOL/KOC合作平台，提供达人招募、内容共创、合作管理等功能。",
      links: [
        { label: "用户端", url: "https://influencer.nihplod.cn", isAdmin: false, description: "达人注册、合作申请、任务领取" },
        { label: "管理端", url: "https://influencer.nihplod.cn/admin", isAdmin: true, description: "仅授权人员使用" },
      ],
    },
  ],
};


export const metadata: Metadata = {
  title: "服务入口",
  description: "快速访问 NIHPLOD 旎柏各服务系统，包括会员系统、官网和达人合作平台。",
  openGraph: {
    title: "服务入口 | NIHPLOD 旎柏",
    description: "快速访问 NIHPLOD 旎柏各服务系统，包括会员系统、官网和达人合作平台。",
    images: ["/images/og-image.png"],
  },
  twitter: {
    card: "summary",
    title: "服务入口 | NIHPLOD 旎柏",
    description: "快速访问 NIHPLOD 旎柏各服务系统，包括会员系统、官网和达人合作平台。",
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

