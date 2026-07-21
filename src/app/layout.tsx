import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
import { ViewTransitions } from "next-view-transitions";
import "./globals.css";
import { MotionProvider } from "@/components/providers/MotionProvider";
import { ChunkErrorBoundary } from "@/components/providers/ChunkErrorBoundary";
import { OrganizationJsonLd, WebSiteJsonLd } from "@/components/seo/JsonLd";
import { BaiduAnalytics } from "@/components/seo/BaiduAnalytics";
import { GoogleAnalytics } from "@/components/seo/GoogleAnalytics";
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
    default: "NIHPLOD 旎柏",
    template: "%s | NIHPLOD 旎柏",
  },
  description:
    "NIHPLOD 旎柏，是源自摩纳哥的专业护肤品牌，通过前沿科技与珍贵成分，致力于为高净值人士打造简单、高效的护肤体验。",
  keywords: [
    "NIHPLOD",
    "旎柏",
    "尼柏",
    "Niphlod",
    "Niphold",
    "护肤品",
    "高端护肤",
    "摩纳哥护肤品牌",
    "摩纳哥护肤品",
    "抗衰老",
    "抗衰老面霜",
    "抗衰老精华",
    "抗老护肤",
    "真脂质体",
    "脂质体护肤",
    "脂质体技术",
    "Liposome护肤",
    "奢华护肤",
    "贵妇护肤",
    "高净值护肤",
    "精准护肤",
    "修护面霜",
    "焕活身体乳",
    "洁面慕斯",
    "保湿精华",
    "Dolphin-Skin",
    "海豚肌肤",
    "逆转时光护肤",
    // 产品昵称
    "童颜精华",
    "白魔法面霜",
    "绿魔法护理油",
    "守护面膜",
    "聚宝瓶身体乳",
    "蛋定防晒",
    "黑曜磨砂膏",
    "云朵洁面",
    "随身笔护手霜",
    // 核心成分
    "玻色因",
    "富勒烯",
    "棕榈酰三肽-5",
    "神经酰胺",
    "烟酰胺",
    "α-熊果苷",
    "乙酰基六肽-8",
    "透明质酸钠",
    "依克多因",
    "角鲨烷",
    "氨基酸洁面",
    "二裂酵母",
    "生育酚",
    "光甘草定",
  ],
  authors: [{ name: "NIHPLOD 官方" }],
  creator: "NIHPLOD 官方",
  publisher: "NIHPLOD 官方 (中国)",

  // 规范链接
  metadataBase: new URL(baseUrl),
  // 注意：不要在根 layout 设置 canonical，否则所有子页面会继承指向首页
  // 每个页面应在各自的 page.tsx 中设置自身的 canonical

  // Open Graph
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: baseUrl,
    siteName: "NIHPLOD 旎柏",
    title: "NIHPLOD 旎柏",
    description:
      "NIHPLOD 旎柏，是源自摩纳哥的专业护肤品牌，通过前沿科技与珍贵成分，致力于为高净值人士打造简单、高效的护肤体验。",
    images: [
      {
        url: "/images/og-image.png",
        width: 1200,
        height: 630,
        alt: "NIHPLOD 旎柏 - 逆转时光",
      },
    ],
  },

  // Twitter Card
  twitter: {
    card: "summary",
    title: "NIHPLOD 旎柏",
    description:
      "NIHPLOD 旎柏，是源自摩纳哥的专业护肤品牌，通过前沿科技与珍贵成分，致力于为高净值人士打造简单、高效的护肤体验。",
    images: ["/images/og-image.png"],
    creator: "@nihplod",
  },

  icons: {
    icon: "/favicon.ico",
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
    google: "",
    // yandex: "your-yandex-verification-code",
    other: {
      "baidu-site-verification": "codeva-Gp1L3OAokH",
    },
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
          {/* 百度移动适配：声明页面适配移动端 */}
          <meta name="applicable-device" content="pc,mobile" />
          {/* Schema.org 结构化数据 */}
          <OrganizationJsonLd />
          <WebSiteJsonLd />
          {/* 百度统计 */}
          <BaiduAnalytics />
          {/* Google Analytics */}
          <GoogleAnalytics />
        </head>
        <body className={`${playfair.variable} font-sans antialiased`} suppressHydrationWarning>
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
