import { Metadata } from "next";
import { ServicesContent } from "./ServicesContent";
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
      id: "website",
      label: "官方网站",
      title: "官方网站",
      nameEn: "Official Website",
      description: "NIHPLOD 旎柏品牌官方网站，展示品牌故事、产品系列、护肤仪式等内容。",
      links: [
        { label: "用户端", url: "https://nihplod.cn", isAdmin: false, description: "品牌展示、产品浏览、AI护肤顾问" },
        { label: "管理端", url: "https://nihplod.cn/admin", isAdmin: true, description: "仅授权人员使用" },
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
  description: "快速访问 NIHPLOD 旎柏各服务系统，包括会员系统、官方网站和达人合作平台。",
  openGraph: {
    title: "服务入口 | NIHPLOD 旎柏",
    description: "快速访问 NIHPLOD 旎柏各服务系统，包括会员系统、官方网站和达人合作平台。",
  },
  twitter: {
    card: "summary",
    title: "服务入口 | NIHPLOD 旎柏",
    description: "快速访问 NIHPLOD 旎柏各服务系统，包括会员系统、官方网站和达人合作平台。",
  },
  robots: {
    index: false, // 服务入口页面不需要被索引
  },
};

export default function ServicesPage() {
  return <ServicesContent content={defaultContent} />;
}

