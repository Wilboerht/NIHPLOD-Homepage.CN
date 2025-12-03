import { Metadata } from "next";
import { ContactContent } from "./ContactContent";

// ISR: 联系我们页面每天重新验证一次
export const revalidate = 86400; // 24小时

export const metadata: Metadata = {
  title: "联系我们",
  description: "有任何问题或建议？欢迎联系 NIHPLOD 旎柏，我们期待与您的每一次交流。",
  openGraph: {
    title: "联系我们 | NIHPLOD 旎柏",
    description: "有任何问题或建议？欢迎联系 NIHPLOD 旎柏，我们期待与您的每一次交流。",
  },
  twitter: {
    card: "summary",
    title: "联系我们 | NIHPLOD 旎柏",
    description: "有任何问题或建议？欢迎联系 NIHPLOD 旎柏。",
  },
};

export default function ContactPage() {
  return <ContactContent />;
}
