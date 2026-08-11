import type { Metadata } from "next";

/**
 * 登出流程页（含 /logout/confirm）为事务页，不参与搜索引擎索引
 * （page.tsx 为客户端组件，metadata 需通过 layout 导出）
 */
export const metadata: Metadata = {
  title: "退出登录",
  robots: {
    index: false,
    follow: false,
  },
};

export default function LogoutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
