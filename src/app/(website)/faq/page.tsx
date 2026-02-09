import { Metadata } from "next";
import { FAQContent } from "@/components/website/FAQContent";


export const revalidate = 3600;

export const metadata: Metadata = {
    title: "常见问题 | NIHPLOD 旎柏",
    description: "NIHPLOD 旎柏常见问题解答，了解关于产品、护肤理念、服务等更多信息。",
};

export default async function FAQPage() {

    return <FAQContent />;
}
