import { Metadata } from "next";

import { TermsContent } from "./TermsContent";
import { defaultTermsContent } from "@/lib/terms-default-content";

// ISR: 服务条款页面每天重新验证一次
export const revalidate = 86400; // 24小时

export const metadata: Metadata = {
  title: "服务条款",
  description:
    "NIHPLOD 旎柏，源自摩纳哥的专业护肤品牌，通过前沿科技与珍贵成分，致力于打造简单、高效的护肤体验。",
  alternates: {
    canonical: "/terms",
  },
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

export default function TermsPage() {
  return <TermsContent content={defaultTermsContent} />;
}
