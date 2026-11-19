import { Metadata } from "next";
import { TechnologyContent } from "./TechnologyContent";
import { BreadcrumbJsonLd } from "@/components/seo/JsonLd";

// ISR: 技术介绍为静态品牌内容，每60秒重新验证一次
export const revalidate = 60;

export const metadata: Metadata = {
  title: "脂质体技术",
  description:
    "了解 NIHPLOD 旎柏核心的脂质体专利技术（Dolphin-Skin）：通过磷脂双分子层囊泡包裹并保护活性成分，使其靶向性在皮肤表皮及真皮层有效释放，让护肤更科学、更高效。",
  authors: [{ name: "NIHPLOD 官方" }],
  alternates: {
    canonical: "/technology",
    languages: {
      "zh-CN": "/technology",
      "x-default": "/technology",
    },
  },
  keywords: [
    "NIHPLOD",
    "旎柏",
    "脂质体技术",
    "脂质体护肤",
    "脂质体专利",
    "Liposome",
    "Dolphin-Skin",
    "活性成分包裹",
    "科学护肤",
  ],
  openGraph: {
    url: "/technology",
    title: "脂质体技术 | NIHPLOD 旎柏",
    description:
      "了解 NIHPLOD 旎柏核心的脂质体专利技术（Dolphin-Skin）：包裹并保护活性成分，靶向释放，让护肤更科学、更高效。",
    images: [
      {
        url: "/images/og-image.png",
        width: 1200,
        height: 630,
        alt: "NIHPLOD 旎柏脂质体技术",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "脂质体技术 | NIHPLOD 旎柏",
    description:
      "了解 NIHPLOD 旎柏核心的脂质体专利技术（Dolphin-Skin）：包裹并保护活性成分，靶向释放，让护肤更科学、更高效。",
    images: ["/images/og-image.png"],
  },
};

export default function TechnologyPage() {
  const breadcrumbs = [
    { name: "首页", url: "/" },
    { name: "脂质体技术", url: "/technology" },
  ];

  return (
    <>
      <BreadcrumbJsonLd items={breadcrumbs} />
      <TechnologyContent />
    </>
  );
}
