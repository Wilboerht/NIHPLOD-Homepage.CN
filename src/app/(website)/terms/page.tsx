import { Metadata } from "next";

import { TermsContent } from "./TermsContent";
import { getPublishedLegalDocument } from "@/lib/legal-document-content";

// 法务内容来自数据库，需要保证发布/初始化填充后立即可见。
// 页面本身低频且 noindex，使用动态渲染 + 读取层 300 秒数据缓存。
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "服务条款",
  description:
    "NIHPLOD 旎柏，源自摩纳哥的专业护肤品牌，通过前沿科技与珍贵成分，致力于打造简单、高效的护肤体验。",
  openGraph: {
    title: "服务条款 | NIHPLOD 旎柏",
    description: "了解使用本网站的各项服务条款与用户协议。",
    images: ["/images/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "服务条款 | NIHPLOD 旎柏",
    description: "了解使用本网站的各项服务条款与用户协议。",
    images: ["/images/og-image.png"],
  },
  robots: {
    index: false, // 服务条款页面通常不需要被索引
  },
};

export default async function TermsPage() {
  const content = await getPublishedLegalDocument("terms");
  return <TermsContent content={content} />;
}
