import HomeClient from "@/components/website/HomeClient";
import { Metadata } from "next";

// ISR: 首页每小时重新验证一次
export const revalidate = 3600;

export const metadata: Metadata = {
  title: {
    absolute: "NIHPLOD 旎柏",
  },
  description:
    "NIHPLOD 旎柏，是源自摩纳哥的专业护肤品牌，通过前沿科技与珍贵成分，致力于为高净值人士打造简单、高效的护肤体验。",
  keywords: [
    "NIHPLOD", "旎柏", "尼柏", "Niphlod", "摩纳哥护肤品牌",
    "高端护肤品", "抗衰老面霜", "脂质体护肤", "奢华护肤", "修护精华",
    "贵妇护肤", "精准护肤", "Dolphin-Skin", "逆转时光"
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "NIHPLOD 旎柏",
    description:
      "探索 NIHPLOD 旎柏——源自摩纳哥的奢华护肤品牌。独创真脂质体专利技术，为全球高净值人士提供精准护肤方案。",
    images: ["/images/og-image.png"],
  },
};

/**
 * 首页 - 简洁品牌布局
 * 双入口：AI 护肤顾问 + 产品浏览
 */
export default async function Home() {
  return <HomeClient />;
}

