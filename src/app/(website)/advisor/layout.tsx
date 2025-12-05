import { ReactNode } from "react";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI 护肤顾问 | NIHPLOD 旎柏",
  description:
    "NIHPLOD AI 护肤顾问，通过智能问答和面部识别，为您提供专属护肤方案和产品推荐。",
  openGraph: {
    title: "AI 护肤顾问 | NIHPLOD 旎柏",
    description:
      "NIHPLOD AI 护肤顾问，通过智能问答和面部识别，为您提供专属护肤方案和产品推荐。",
  },
};

interface AdvisorLayoutProps {
  children: ReactNode;
}

/**
 * AI 护肤顾问布局
 * 独立布局，不使用网站的底部导航
 */
export default function AdvisorLayout({ children }: AdvisorLayoutProps) {
  return (
    <div className="min-h-screen bg-brand-cream">
      {children}
    </div>
  );
}

