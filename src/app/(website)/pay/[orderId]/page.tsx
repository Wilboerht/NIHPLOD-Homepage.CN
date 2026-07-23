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

  // 只有待支付或支付中的订单才允许进入支付页
  // 其他状态（已支付/已取消/已完成等）跳转回首页
  if (order.status !== "PENDING" && order.status !== "PAYING") {
    redirect("/");
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[#FBF8F0]">
      {/* 支付内容 - 自动打开模态框 */}
      <PayContent orderId={orderId} />
    </div>
  );
}
