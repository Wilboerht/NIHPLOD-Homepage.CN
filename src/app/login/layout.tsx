import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "登录 | NIHPLOD 旎柏",
  description:
    "登录或注册 NIHPLOD 旎柏账号，管理您的订单、会员权益与个性化护肤方案。NIHPLOD 旎柏，源自摩纳哥的专业护肤品牌。",
  alternates: {
    canonical: "/login",
  },
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: "登录 | NIHPLOD 旎柏",
    description:
      "登录或注册 NIHPLOD 旎柏账号，管理您的订单、会员权益与个性化护肤方案。",
    images: ["/images/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "登录 | NIHPLOD 旎柏",
    description:
      "登录或注册 NIHPLOD 旎柏账号，管理您的订单、会员权益与个性化护肤方案。",
    images: ["/images/og-image.png"],
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
