import { Metadata } from "next";
import { FAQContent } from "@/components/website/FAQContent";
import { FAQJsonLd, BreadcrumbJsonLd } from "@/components/seo/JsonLd";
import { faqData } from "@/config/faq-data";

const faqSchemaData = faqData.map((item) => ({
  question: item.question,
  answer: item.answer.join(""),
}));

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "常见问题",
  description: "关于 NIHPLOD 旎柏，你想知道的都在这里。",
  alternates: {
    canonical: "/faq",
  },
  keywords: [
    "NIHPLOD",
    "旎柏",
    "常见问题",
    "护肤问答",
    "脂质体护肤",
    "抗衰老",
    "护肤建议",
    "高端护肤品",
  ],
  openGraph: {
    title: "常见问题 | NIHPLOD 旎柏",
    description: "关于 NIHPLOD 旎柏，你想知道的都在这里。",
    images: ["/images/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "常见问题 | NIHPLOD 旎柏",
    description: "关于 NIHPLOD 旎柏，你想知道的都在这里。",
    images: ["/images/og-image.png"],
  },
};

export default async function FAQPage() {
  const breadcrumbs = [
    { name: "首页", url: "/" },
    { name: "常见问题", url: "/faq" },
  ];

  return (
    <>
      <FAQJsonLd items={faqSchemaData} />
      <BreadcrumbJsonLd items={breadcrumbs} />
      <FAQContent />
    </>
  );
}
