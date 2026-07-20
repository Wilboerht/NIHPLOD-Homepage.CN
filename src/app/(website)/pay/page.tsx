import { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "支付",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PayPage() {
  // 支付统一使用全局支付弹窗链路
  redirect("/cart");
}
