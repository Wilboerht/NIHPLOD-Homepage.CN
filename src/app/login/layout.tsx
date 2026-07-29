import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "登录 / 注册 | NIHPLOD 旎柏",
  description: "登录或注册 NIHPLOD 旎柏账户，管理订单、地址、会员权益与护肤方案。",
  robots: {
    index: false,
    follow: false,
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
