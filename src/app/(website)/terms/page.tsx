import { Metadata } from "next";
import { TermsContent } from "./TermsContent";

export const metadata: Metadata = {
  title: "服务条款",
  description: "了解使用 NIHPLOD 旎柏服务的条款和条件。",
  openGraph: {
    title: "服务条款 | NIHPLOD 旎柏",
    description: "了解使用 NIHPLOD 旎柏服务的条款和条件。",
  },
  twitter: {
    card: "summary",
    title: "服务条款 | NIHPLOD 旎柏",
    description: "了解使用 NIHPLOD 旎柏服务的条款和条件。",
  },
  robots: {
    index: false, // 服务条款页面通常不需要被索引
  },
};

export default function TermsPage() {
  return <TermsContent />;
}

