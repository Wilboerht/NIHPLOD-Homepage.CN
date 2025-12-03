import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/500.css";
import "@fontsource/playfair-display/600.css";
import "@fontsource/playfair-display/700.css";
import "./globals.css";
import { MotionProvider } from "@/components/providers/MotionProvider";
import { OrganizationJsonLd, WebSiteJsonLd } from "@/components/seo/JsonLd";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NIHPLOD 旎柏 | 逆转时光",
  description: "NIHPLOD 旎柏，源自摩纳哥的高端护肤品牌，以尖端科技与珍贵成分，为您开启逆转时光的奢华护肤之旅",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        {/* Schema.org 结构化数据 */}
        <OrganizationJsonLd />
        <WebSiteJsonLd />
      </head>
      <body className={`${playfair.variable} font-sans antialiased`}>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
