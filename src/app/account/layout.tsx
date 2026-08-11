import type { Metadata } from "next";

/**
 * 用户中心页（含 /account/embed 嵌入版）为会员事务页，不参与搜索引擎索引
 * （page.tsx 为客户端组件，metadata 需通过 layout 导出）
 */
export const metadata: Metadata = {
  title: "会员中心",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
