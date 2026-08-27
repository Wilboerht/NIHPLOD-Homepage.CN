import type { Metadata } from "next";

/**
 * 用户中心相关路由（/account 兼容重定向页 + /account/embed 嵌入版）
 * 为会员事务页，不参与搜索引擎索引
 * （metadata 需在服务端组件导出，故放在 layout）
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
