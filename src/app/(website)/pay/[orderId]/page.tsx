/**
 * 支付页面 - 自动打开支付模态框
 */
import { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getCurrentLoginUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PayContent from "./PayContent";

export const metadata: Metadata = {
  title: "订单支付",
  robots: {
    index: false,
    follow: false,
  },
};

type PayPageProps = {
  params: Promise<{ orderId: string }>;
};

export default async function PayPage({ params }: PayPageProps) {
  const { orderId } = await params;
  const user = await getCurrentLoginUser();

  if (!user) {
    redirect("/login");
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, userId: user.id },
  });

  if (!order) {
    notFound();
  }

  // 如果已支付，跳转到订单详情
  if (order.status !== "PENDING") {
    redirect(`/user/orders/${order.id}`);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[#FBF8F0]">
      {/* 支付内容 - 自动打开模态框 */}
      <PayContent orderId={orderId} />
    </div>
  );
}
