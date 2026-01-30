import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
import { ViewTransitions } from "next-view-transitions";
import "./globals.css";
import { MotionProvider } from "@/components/providers/MotionProvider";
import { ChunkErrorBoundary } from "@/components/providers/ChunkErrorBoundary";
import { OrganizationJsonLd, WebSiteJsonLd } from "@/components/seo/JsonLd";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { ToastProvider } from "@/components/ui/Toast";
import { AuthProvider } from "@/contexts/AuthContext";

// Playfair Display 字体
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

// 基础 URL
const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://nihplod.cn";

export const metadata: Metadata = {
  // 基本信息
  title: {
    default: "NIHPLOD 旎柏 | 逆转时光",
    template: "%s | NIHPLOD 旎柏",
  },
  description: "NIHPLOD 旎柏，源自摩纳哥的高端护肤品牌，以尖端科技与珍贵成分，为您开启逆转时光的奢华护肤之旅",
  keywords: ["NIHPLOD", "旎柏", "护肤品", "高端护肤", "摩纳哥", "抗衰老", "逆转时光", "奢华护肤"],
  authors: [{ name: "NIHPLOD 旎柏" }],
  creator: "NIHPLOD 旎柏",
  publisher: "NIHPLOD 旎柏",

  // 规范链接
  metadataBase: new URL(baseUrl),
  alternates: {
    canonical: "/",
  },

  // Open Graph
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: baseUrl,
    siteName: "NIHPLOD 旎柏",
    title: "NIHPLOD 旎柏 | 逆转时光",
    description: "NIHPLOD 旎柏，源自摩纳哥的高端护肤品牌，以尖端科技与珍贵成分，为您开启逆转时光的奢华护肤之旅",
    images: [
      {
        url: "/images/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "NIHPLOD 旎柏 - 逆转时光",
      },
    ],
  },

  // Twitter Card
  twitter: {
    card: "summary_large_image",
    title: "NIHPLOD 旎柏 | 逆转时光",
    description: "NIHPLOD 旎柏，源自摩纳哥的高端护肤品牌，以尖端科技与珍贵成分，为您开启逆转时光的奢华护肤之旅",
    images: ["/images/og-image.jpg"],
    creator: "@nihplod",
  },

  // 其他 SEO
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  // 验证
  verification: {
    // google: "your-google-verification-code",
    // yandex: "your-yandex-verification-code",
  },

  // 其他
  category: "beauty",
  classification: "skincare",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ViewTransitions>
      <html lang="zh-CN">
        <head>
          {/* 移动端安全区域支持 - 让内容可以延伸到状态栏/刘海区域 */}
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
          {/* iOS 状态栏样式 - 透明背景 */}
          <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
          {/* Schema.org 结构化数据 */}
          <OrganizationJsonLd />
          <WebSiteJsonLd />
        </head>
        <body className={`${playfair.variable} font-sans antialiased`}>
          <ChunkErrorBoundary>
            <MotionProvider>
              <AuthProvider>
                <ToastProvider>
                  {children}
                  <CartDrawer />
                </ToastProvider>
              </AuthProvider>
            </MotionProvider>
          </ChunkErrorBoundary>
        </body>
      </html>
    </ViewTransitions>
  );
}
