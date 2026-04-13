import { Metadata } from "next";
import { FAQContent } from "@/components/website/FAQContent";


export const revalidate = 3600;

export const metadata: Metadata = {
    title: "常见问题",
    description: "NIHPLOD 旎柏咨询中心。了解关于真脂质体产品、科学护肤理念、各级服务的常见问题解答。",
};

export default async function FAQPage() {

    return <FAQContent />;
}
