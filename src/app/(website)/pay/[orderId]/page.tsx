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
};

interface PayPageProps {
  params: { orderId: string };
}

export default async function PayPage({ params }: PayPageProps) {
  const user = await getCurrentLoginUser();

  if (!user) {
    redirect("/login");
  }

  const { orderId } = params;

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
    <div className="min-h-dvh bg-[#FAF8F5] flex flex-col">
      {/* 支付内容 - 自动打开模态框 */}
      <PayContent orderId={orderId} />
    </div>
  );
}

