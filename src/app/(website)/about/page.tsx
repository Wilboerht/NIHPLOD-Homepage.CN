import { Metadata } from "next";
import { StoryContent } from "./StoryContent";
import { BreadcrumbJsonLd } from "@/components/seo/JsonLd";

// ISR: 品牌故事页面每60秒重新验证一次
export const revalidate = 60;

export const metadata: Metadata = {
  title: "品牌故事",
  description:
    "探索 NIHPLOD 旎柏的品牌故事——源自摩纳哥的高端护肤品牌，以真脂质体专利技术（Dolphin-Skin）为核心，融合前沿科技与珍贵成分，为您带来逆转时光的奢华护肤体验。",
  alternates: {
    canonical: "/about",
  },
  keywords: [
    "NIHPLOD",
    "旎柏",
    "品牌故事",
    "摩纳哥护肤品牌",
    "高端护肤",
    "真脂质体技术",
    "Dolphin-Skin",
    "科学护肤",
  ],
  openGraph: {
    title: "品牌故事 | NIHPLOD 旎柏",
    description:
      "探索 NIHPLOD 旎柏的品牌故事——源自摩纳哥的专业护肤品牌，通过前沿科技与珍贵成分，致力于打造简单、高效的护肤体验。",
    images: ["/images/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "品牌故事 | NIHPLOD 旎柏",
    description:
      "探索 NIHPLOD 旎柏的品牌故事——源自摩纳哥的专业护肤品牌，通过前沿科技与珍贵成分，致力于打造简单、高效的护肤体验。",
    images: ["/images/og-image.png"],
  },
};

// ...

export default async function StoryPage() {
  const breadcrumbs = [
    { name: "首页", url: "/" },
    { name: "品牌故事", url: "/about" },
  ];

  return (
    <>
      <BreadcrumbJsonLd items={breadcrumbs} />
      <StoryContent />
    </>
  );
}
