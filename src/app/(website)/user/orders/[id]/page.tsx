/**
 * 订单详情页面
 */
import { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getCurrentLoginUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LOGISTICS_COMPANIES } from "@/lib/logistics-constants";
import OrderActions from "./OrderActions";

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

  const companyName = order.shippingCompany
    ? LOGISTICS_COMPANIES.find(c => c.code === order.shippingCompany)?.name || order.shippingCompany
    : "-";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 订单状态 */}
      <div className="bg-[#A69374] text-white">
        {/* Updated Color to match brand */}
        <div className="container mx-auto px-4 py-8">
          <p className="text-3xl font-light tracking-wide">{STATUS_LABELS[order.status]}</p>
          <p className="text-white/80 text-sm mt-2 font-mono">NO.{order.orderNo}</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-4 -mt-4 relative z-10">

        {/* 物流信息 (仅已发货/已完成显示) */}
        {(order.status === "SHIPPED" || order.status === "DELIVERED" || order.status === "COMPLETED") && (
          <div className="bg-white rounded-xl p-5 shadow-sm">
            <h3 className="font-medium text-[#5C5347] mb-3 flex items-center gap-2">
              <span className="w-1 h-4 bg-[#A69374] rounded-full"></span>
              物流信息
            </h3>
            <div className="space-y-2 text-sm text-[#8B8579]">
              <div className="flex justify-between">
                <span>物流公司</span>
                <span className="text-[#5C5347] font-medium">{companyName}</span>
              </div>
              <div className="flex justify-between">
                <span>快递单号</span>
                <span className="text-[#5C5347] font-mono select-all">{order.trackingNo || "-"}</span>
              </div>
            </div>
          </div>
        )}

        {/* 收货信息 */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="font-medium text-[#5C5347] mb-3 flex items-center gap-2">
            <span className="w-1 h-4 bg-[#A69374] rounded-full"></span>
            收货信息
          </h3>
          <p className="text-sm text-[#5C5347] font-medium">
            {order.recipientName} <span className="ml-2 text-[#8B8579] font-normal">{order.recipientPhone}</span>
          </p>
          <p className="text-sm text-[#8B8579] mt-1 leading-relaxed">{order.recipientAddress}</p>
        </div>

        {/* 商品列表 */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          {/* ... existing items logic ... */}
          <div className="space-y-4">
            {order.items.map((item) => (
              <div key={item.id} className="flex gap-4">
                <div className="w-20 h-20 bg-[#F5F2ED] rounded-lg overflow-hidden flex-shrink-0 border border-[#E8E3DC]">
                  {item.productImage && (
                    <Image
                      src={item.productImage}
                      alt={item.productName}
                      width={80}
                      height={80}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                  <div>
                    <p className="text-sm font-medium text-[#5C5347] truncate">{item.productName}</p>
                    {/* Variant info if available */}
                  </div>
                  <div className="flex justify-between items-end">
                    <span className="text-[#A69374] text-sm">¥{Number(item.price).toFixed(2)}</span>
                    <span className="text-[#A69B8C] text-xs">x{item.quantity}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 价格明细 */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <div className="space-y-2 text-sm text-[#8B8579]">
            <div className="flex justify-between">
              <span>商品总价</span>
              <span>¥{Number(order.totalAmount).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>运费</span>
              <span>¥{Number(order.shippingFee).toFixed(2)}</span>
            </div>
            {Number(order.discountAmount) > 0 && (
              <div className="flex justify-between text-[#A69374]">
                <span>优惠</span>
                <span>-¥{Number(order.discountAmount).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between pt-3 mt-1 border-t border-[#F0EBE4] font-medium items-center">
              <span className="text-[#5C5347]">实付金额</span>
              <span className="text-[#A69374] text-xl">¥{Number(order.payAmount).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* 订单元数据 */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          {/* ... existing metadata ... */}
          <div className="space-y-2 text-xs text-[#A69B8C]">
            <p>下单时间：{new Date(order.createdAt).toLocaleString("zh-CN")}</p>
            {order.paymentTime && (
              <p>付款时间：{new Date(order.paymentTime).toLocaleString("zh-CN")}</p>
            )}
            {order.remark && <p className="pt-2 border-t border-[#F0EBE4] mt-2">备注：{order.remark}</p>}
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="sticky bottom-0 bg-white/90 backdrop-blur-md p-4 -mx-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] border-t border-[#E8E3DC]">
          <OrderActions order={order} />
        </div>
      </div>
    </div>
  );
}
