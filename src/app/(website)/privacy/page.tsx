import { Metadata } from "next";
import { PrivacyContent } from "./PrivacyContent";

export const metadata: Metadata = {
  title: "隐私政策",
  description: "了解 NIHPLOD 旎柏如何收集、使用和保护您的个人信息。",
  openGraph: {
    title: "隐私政策 | NIHPLOD 旎柏",
    description: "了解 NIHPLOD 旎柏如何收集、使用和保护您的个人信息。",
  },
  twitter: {
    card: "summary",
    title: "隐私政策 | NIHPLOD 旎柏",
    description: "了解 NIHPLOD 旎柏如何收集、使用和保护您的个人信息。",
  },
  robots: {
    index: false, // 隐私政策页面通常不需要被索引
  },
};

export default function PrivacyPage() {
  return <PrivacyContent />;
}
