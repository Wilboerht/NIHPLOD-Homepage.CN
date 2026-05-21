import HomeClient from "@/components/website/HomeClient";
import { Metadata } from "next";

// ISR: 首页每小时重新验证一次
export const revalidate = 3600;

export const metadata: Metadata = {
  title: {
    absolute: "NIHPLOD 旎柏",
  },
  description:
    "探索 NIHPLOD 旎柏（Niphlod）——源自摩纳哥的奢华护肤品牌。独创真脂质体 Dolphin-Skin 专利技术，提供抗衰老修护面霜、焕活身体乳、温和洁面慕斯等高端护肤产品。开启逆转时光的精准护肤之旅。",
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

