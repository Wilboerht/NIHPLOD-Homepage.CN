import { Metadata } from "next";
import { ContactContent } from "./ContactContent";
import { BreadcrumbJsonLd, LocalBusinessJsonLd } from "@/components/seo/JsonLd";

// ISR: 联系我们页面每天重新验证一次
export const revalidate = 86400; // 24小时

export const metadata: Metadata = {
  title: "联系我们",
  description: "有任何问题或建议？欢迎联系 NIHPLOD 旎柏，我们期待与您的每一次交流。",
  alternates: {
    canonical: "/contact",
  },
  keywords: [
    "NIHPLOD", "旎柏", "联系我们", "客服", "品牌咨询",
    "售后服务", "商务合作", "高端护肤品牌联系方式",
  ],
  openGraph: {
    title: "联系我们 | NIHPLOD 旎柏",
    description: "有任何问题或建议？欢迎联系 NIHPLOD 旎柏，我们期待与您的每一次交流。",
    images: ["/images/og-image.png"],
  },
  twitter: {
    card: "summary",
    title: "联系我们 | NIHPLOD 旎柏",
    description: "有任何问题或建议？欢迎联系 NIHPLOD 旎柏。",
    images: ["/images/og-image.png"],
  },
};

export default function ContactPage() {
  const breadcrumbs = [
    { name: "首页", url: "/" },
    { name: "联系我们", url: "/contact" },
  ];

  return (
    <>
      <BreadcrumbJsonLd items={breadcrumbs} />
      <LocalBusinessJsonLd
        address={{
          street: "信泰中心T3栋610室",
          city: "上海市",
          region: "普陀区",
          postalCode: "200333",
          country: "CN",
        }}
        telephone="+86-21-xxxx-xxxx"
      />
      <ContactContent content={undefined} />
    </>
  );
}
