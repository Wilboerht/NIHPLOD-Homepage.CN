import { Metadata } from "next";
import { AdvisorWelcome } from "./AdvisorWelcome";

export const metadata: Metadata = {
  title: "AI 护肤顾问",
  description: "通过 AI 智能分析，获取专属于您的个性化护肤方案。NIHPLOD 旎柏 AI 护肤顾问，科技赋能美丽。",
  openGraph: {
    title: "AI 护肤顾问 | NIHPLOD 旎柏",
    description: "通过 AI 智能分析，获取专属于您的个性化护肤方案。NIHPLOD 旎柏 AI 护肤顾问，科技赋能美丽。",
    images: ["/images/advisor-og.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI 护肤顾问 | NIHPLOD 旎柏",
    description: "通过 AI 智能分析，获取专属于您的个性化护肤方案。",
    images: ["/images/advisor-og.jpg"],
  },
};

export default function AdvisorPage() {
  return <AdvisorWelcome />;
}
