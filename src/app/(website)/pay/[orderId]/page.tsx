/**
 * 支付页面
 */
import { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getCurrentLoginUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PayContent from "./PayContent";

export const metadata: Metadata = {
  title: "订单支付 - 你好朵朵",
};

interface PayPageProps {
  params: Promise<{ orderId: string }>;
}

export default async function PayPage({ params }: PayPageProps) {
  const user = await getCurrentLoginUser();
  
  if (!user) {
    redirect("/login");
  }

  const { orderId } = await params;

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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 头部 */}
      <div className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-lg font-semibold text-gray-900">订单支付</h1>
        </div>
      </div>

      {/* 支付内容 */}
      <PayContent order={order} />
    </div>
  );
}

