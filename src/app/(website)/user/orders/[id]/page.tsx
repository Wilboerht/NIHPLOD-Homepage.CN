/**
 * 订单详情页面
 */
import { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getCurrentLoginUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "订单详情 - 你好朵朵",
};

// 状态文案
const STATUS_LABELS: Record<string, string> = {
  PENDING: "待付款",
  PAID: "已支付",
  PROCESSING: "处理中",
  SHIPPED: "已发货",
  DELIVERED: "已送达",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  REFUNDING: "退款中",
  REFUNDED: "已退款",
};

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const user = await getCurrentLoginUser();
  
  if (!user) {
    redirect("/login?redirect=/user/orders");
  }

  const { id } = await params;

  const order = await prisma.order.findFirst({
    where: { id, userId: user.id },
    include: { items: true },
  });

  if (!order) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 订单状态 */}
      <div className="bg-pink-500 text-white">
        <div className="container mx-auto px-4 py-6">
          <p className="text-2xl font-bold">{STATUS_LABELS[order.status]}</p>
          <p className="text-white/80 text-sm mt-1">订单号：{order.orderNo}</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-4">
        {/* 收货信息 */}
        <div className="bg-white rounded-xl p-4">
          <h3 className="font-medium text-gray-900 mb-2">收货信息</h3>
          <p className="text-sm text-gray-600">
            {order.recipientName} {order.recipientPhone}
          </p>
          <p className="text-sm text-gray-500">{order.recipientAddress}</p>
        </div>

        {/* 商品列表 */}
        <div className="bg-white rounded-xl p-4">
          <h3 className="font-medium text-gray-900 mb-3">商品信息</h3>
          <div className="space-y-3">
            {order.items.map((item) => (
              <div key={item.id} className="flex gap-3">
                <div className="w-16 h-16 bg-gray-100 rounded overflow-hidden flex-shrink-0">
                  {item.productImage && (
                    <Image
                      src={item.productImage}
                      alt={item.productName}
                      width={64}
                      height={64}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{item.productName}</p>
                  <div className="flex justify-between mt-1 text-sm">
                    <span className="text-gray-500">¥{Number(item.price).toFixed(2)}</span>
                    <span className="text-gray-400">x{item.quantity}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 价格明细 */}
        <div className="bg-white rounded-xl p-4">
          <h3 className="font-medium text-gray-900 mb-3">价格明细</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">商品总价</span>
              <span>¥{Number(order.totalAmount).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">运费</span>
              <span>¥{Number(order.shippingFee).toFixed(2)}</span>
            </div>
            {Number(order.discountAmount) > 0 && (
              <div className="flex justify-between text-red-500">
                <span>优惠</span>
                <span>-¥{Number(order.discountAmount).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t font-medium">
              <span>实付金额</span>
              <span className="text-pink-500 text-lg">¥{Number(order.payAmount).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* 订单信息 */}
        <div className="bg-white rounded-xl p-4">
          <h3 className="font-medium text-gray-900 mb-3">订单信息</h3>
          <div className="space-y-2 text-sm text-gray-500">
            <p>下单时间：{new Date(order.createdAt).toLocaleString("zh-CN")}</p>
            {order.paymentTime && (
              <p>付款时间：{new Date(order.paymentTime).toLocaleString("zh-CN")}</p>
            )}
            {order.remark && <p>备注：{order.remark}</p>}
          </div>
        </div>

        {/* 操作按钮 */}
        {order.status === "PENDING" && (
          <div className="flex gap-3">
            <Link
              href={`/pay/${order.id}`}
              className="flex-1 py-3 bg-pink-500 text-white text-center rounded-xl font-medium"
            >
              去付款
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

