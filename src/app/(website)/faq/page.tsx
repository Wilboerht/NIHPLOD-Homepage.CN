import { Metadata } from "next";
import { FAQContent } from "@/components/website/FAQContent";


export const revalidate = 3600;

export const metadata: Metadata = {
    title: "常见问题",
    description: "NIHPLOD 旎柏常见问题解答。了解真脂质体护肤技术、抗衰老产品使用方法、修护面霜与焕活身体乳的功效、适合肤质及护肤建议。",
    alternates: {
      canonical: "/faq",
    },
    keywords: [
      "NIHPLOD", "旎柏", "常见问题", "护肤问答", "脂质体护肤",
      "抗衰老产品", "修护面霜用法", "焕活身体乳", "护肤建议", "高端护肤品"
    ],
};

export default async function FAQPage() {

    return <FAQContent />;
}
