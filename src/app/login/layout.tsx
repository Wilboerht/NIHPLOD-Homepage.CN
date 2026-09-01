import type { Metadata } from "next";

/**
 * 登录页为会员事务页，不参与搜索引擎索引
 * （page.tsx 为客户端组件，metadata 需通过 layout 导出）
 */
export const metadata: Metadata = {
  title: "登录 / 注册",
  description: "登录或注册 NIHPLOD 旎柏账户，管理会员权益与专属护肤方案。",
  robots: {
    index: false,
    follow: false,
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
