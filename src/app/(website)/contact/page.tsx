import { Metadata } from "next";
import { ContactContent } from "./ContactContent";

export const metadata: Metadata = {
  title: "联系我们 | NIHPLOD 旎柏",
  description: "有任何问题或建议？欢迎联系 NIHPLOD 旎柏，我们期待与您的每一次交流。",
  openGraph: {
    title: "联系我们 | NIHPLOD 旎柏",
    description: "有任何问题或建议？欢迎联系 NIHPLOD 旎柏，我们期待与您的每一次交流。",
  },
};

export default function ContactPage() {
  return <ContactContent />;
}
