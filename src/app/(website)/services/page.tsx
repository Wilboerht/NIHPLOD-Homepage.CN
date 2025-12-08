import { Metadata } from "next";
import { ServicesContent } from "./ServicesContent";

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
  return <ServicesContent />;
}

