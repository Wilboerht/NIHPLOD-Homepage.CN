import { Metadata } from "next";
import { FAQContent } from "@/components/website/FAQContent";
import prisma from "@/lib/prisma";

export const revalidate = 3600;

export const metadata: Metadata = {
    title: "常见问题 | NIHPLOD 旎柏",
    description: "NIHPLOD 旎柏常见问题解答，了解关于产品、护肤理念、服务等更多信息。",
};

export default async function FAQPage() {
    let backgroundImage: string | undefined;

    try {
        // Attempt to fetch background image from a 'faq' page record if it exists, or fallback to 'home' or default
        const page = await prisma.page.findUnique({
            where: { slug: "faq" },
            select: { backgroundImage: true, published: true },
        });

        if (page?.published && page.backgroundImage) {
            backgroundImage = page.backgroundImage;
        } else {
            // Fallback to home background if no specific FAQ background
            const homePage = await prisma.page.findUnique({
                where: { slug: "home" },
                select: { backgroundImage: true },
            });
            if (homePage?.backgroundImage) {
                backgroundImage = homePage.backgroundImage;
            }
        }
    } catch (error) {
        console.error("Failed to fetch FAQ page data:", error);
    }

    return <FAQContent backgroundImage={backgroundImage} />;
}
