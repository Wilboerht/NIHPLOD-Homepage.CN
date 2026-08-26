import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
import { ViewTransitions } from "next-view-transitions";
import "./globals.css";
import { MotionProvider } from "@/components/providers/MotionProvider";
import { ChunkErrorBoundary } from "@/components/providers/ChunkErrorBoundary";
import { OrganizationJsonLd, WebSiteJsonLd } from "@/components/seo/JsonLd";
import { BaiduAnalytics } from "@/components/seo/BaiduAnalytics";
import { GoogleAnalytics } from "@/components/seo/GoogleAnalytics";
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
    "NIHPLOD 旎柏，源自摩纳哥的专业护肤品牌，通过前沿科技与珍贵成分，致力于打造简单、高效的护肤体验。",
  // meta keywords 对 Google 无效、百度权重极低，仅保留高商业意图词作为语义补充；
  // 核心排名依赖各页面 title / description / H1 / JSON-LD 中的关键词布局
  keywords: [
    // 品牌词（含高频拼错变体，拦截误拼流量）
    "NIHPLOD",
    "nihplod",
    "nb",
    "旎柏",
    "尼柏",
    "你播",
    "Niphlod",
    "肌智派",
    // 品牌理念
    "Less but better",
    "科学护肤",
    // 品类 + 差异化定位
    "摩纳哥护肤品牌",
    "高端护肤品",
    "贵妇护肤",
    // 高购买意图产品词
    "抗衰老面霜",
    "抗衰老精华",
    "修护面霜",
    // 专利技术词（品牌独有搜索词）
    "真脂质体",
    "Dolphin-Skin",
    // 社交种草昵称（小红书/抖音引流搜索词）
    "童颜精华",
    "白魔法面霜",
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
      "NIHPLOD 旎柏，源自摩纳哥的专业护肤品牌，通过前沿科技与珍贵成分，致力于打造简单、高效的护肤体验。",
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
    card: "summary_large_image",
    title: "NIHPLOD 旎柏",
    description:
      "NIHPLOD 旎柏，源自摩纳哥的专业护肤品牌，通过前沿科技与珍贵成分，致力于打造简单、高效的护肤体验。",
    images: ["/images/og-image.png"],
    creator: "@nihplod",
  },

  // 搜索引擎（Google/Bing/百度）要求 favicon 至少 48x48、大于 48 时边长须为 48 的倍数，
  // 否则搜索结果回退为默认地球图标；故提供 96/192 高分辨率 PNG，ico 仅作旧浏览器兜底
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon" },
      { url: "/images/icons/favicon-96.png", type: "image/png", sizes: "96x96" },
      { url: "/images/icons/favicon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/images/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },

  // PWA 清单
  manifest: "/manifest.json",

  // 国际化 hreflang
  alternates: {
    languages: {
      "zh-CN": baseUrl,
    },
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

  // 验证（接入 Google Search Console 时在此填入真实 code：google: "your-code"）
  verification: {
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
                <ToastProvider>{children}</ToastProvider>
              </AuthProvider>
            </MotionProvider>
          </ChunkErrorBoundary>
        </body>
      </html>
    </ViewTransitions>
  );
}
