import { Metadata } from "next";
import { PrivacyContent } from "./PrivacyContent";
import { BreadcrumbJsonLd } from "@/components/seo/JsonLd";

// ISR: 隐私政策页面每天重新验证一次
export const revalidate = 86400; // 24小时

export const metadata: Metadata = {
  title: "隐私政策",
  description: "了解 NIHPLOD 旎柏如何收集、使用和保护您的个人信息。",
  alternates: {
    canonical: "/privacy",
  },
  openGraph: {
    title: "隐私政策 | NIHPLOD 旎柏",
    description: "了解 NIHPLOD 旎柏如何收集、使用和保护您的个人信息。",
    images: ["/images/og-image.png"],
  },
  twitter: {
    card: "summary",
    title: "隐私政策 | NIHPLOD 旎柏",
    description: "了解 NIHPLOD 旎柏如何收集、使用和保护您的个人信息。",
    images: ["/images/og-image.png"],
  },
  robots: {
    index: false, // 隐私政策页面通常不需要被索引
  },
};

export default function PrivacyPage() {
  const breadcrumbs = [
    { name: "首页", url: "/" },
    { name: "隐私政策", url: "/privacy" },
  ];

  return (
    <>
      <BreadcrumbJsonLd items={breadcrumbs} />
      <PrivacyContent />
    </>
  );
}
