import { notFound } from "next/navigation";
import type { Metadata } from "next";

/**
 * 领券中心页面（暂未上线）
 * 任何访问都会返回 404（Next.js 对 404 响应自动输出 robots noindex，不会被收录）；
 * 下方 metadata 为双重保险：后续上线移除 notFound() 时页面仍保持 noindex，
 * 届时改为可索引只需删除 robots 声明。
 */
export const metadata: Metadata = {
  title: "领券中心",
  robots: {
    index: false,
    follow: false,
  },
};

export default function CouponsPage() {
  notFound();
}
