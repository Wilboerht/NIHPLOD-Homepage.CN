"use client";

/**
 * 订单列表组件
 * 自然纹理风格
 */
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import type { Order, OrderItem } from "@/generated/prisma/client";

// 状态配置 - 自然色调
const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  PENDING: {
    label: "待付款",
    color: "text-amber-700",
    bgColor: "bg-amber-50 border-amber-200",
  },
  PAID: {
    label: "已付款",
    color: "text-blue-700",
    bgColor: "bg-blue-50 border-blue-200",
  },
  PROCESSING: {
    label: "处理中",
    color: "text-cyan-700",
    bgColor: "bg-cyan-50 border-cyan-200",
  },
  SHIPPED: {
    label: "已发货",
    color: "text-emerald-700",
    bgColor: "bg-emerald-50 border-emerald-200",
  },
  DELIVERED: {
    label: "已送达",
    color: "text-green-700",
    bgColor: "bg-green-50 border-green-200",
  },
  COMPLETED: {
    label: "已完成",
    color: "text-[#7A6F5D]",
    bgColor: "bg-[#F5F2ED] border-[#D4CFC6]",
  },
  CANCELLED: {
    label: "已取消",
    color: "text-[#9A9488]",
    bgColor: "bg-gray-100 border-gray-200",
  },
  REFUNDING: {
    label: "退款中",
    color: "text-orange-700",
    bgColor: "bg-orange-50 border-orange-200",
  },
  REFUNDED: {
    label: "已退款",
    color: "text-[#8B8579]",
    bgColor: "bg-gray-100 border-gray-200",
  },
};

interface OrderWithItems extends Order {
  items: Pick<OrderItem, "id" | "productName" | "productImage" | "price" | "quantity">[];
}

interface OrderListProps {
  orders: OrderWithItems[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  currentStatus: string;
}

export default function OrderList({ orders, pagination, currentStatus }: OrderListProps) {
  return (
    <div className="space-y-4">
      {/* 订单统计 */}
      <div className="flex items-center justify-between px-1 mb-2">
        <p className="text-[#8B8579] text-sm">
          共 <span className="text-[#7A6F5D] font-medium">{pagination.total}</span> 个订单
        </p>
        <p className="text-[#A69B8C] text-xs">
          第 {pagination.page} / {pagination.totalPages} 页
        </p>
      </div>

      {/* 订单卡片列表 */}
      {orders.map((order) => (
        <div
          key={order.id}
          className="group bg-white/80 backdrop-blur-sm rounded-2xl overflow-hidden border border-[#E8E3DC] hover:border-[#C4BDB2] hover:shadow-lg hover:shadow-[#D4CFC6]/20 transition-all duration-300"
        >
          {/* 订单头部 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#F0EBE4]">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[#A69B8C]">订单号</span>
              <span className="text-[#5C5347] font-mono">{order.orderNo}</span>
            </div>
            <StatusBadge status={order.status} />
          </div>

          {/* 商品列表 */}
          <Link href={`/user/orders/${order.id}`} className="block p-4">
            <div className="space-y-3">
              {order.items.slice(0, 2).map((item) => (
                <div key={item.id} className="flex gap-3">
                  {/* 商品图片 */}
                  <div className="relative w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden bg-[#F5F2ED] flex-shrink-0 border border-[#E8E3DC]">
                    {item.productImage ? (
                      <Image
                        src={item.productImage}
                        alt={item.productName}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <svg className="w-6 h-6 text-[#C4BDB2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* 商品信息 */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <p className="text-[#5C5347] text-sm truncate mb-1">{item.productName}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[#A69374] text-sm font-medium">¥{Number(item.price).toFixed(2)}</span>
                      <span className="text-[#A69B8C] text-xs">×{item.quantity}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {order.items.length > 2 && (
              <div className="mt-3 text-center">
                <span className="text-[#A69B8C] text-xs">共 {order.items.length} 件商品</span>
              </div>
            )}
          </Link>

          {/* 订单底部 */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#F0EBE4] bg-[#FAF8F5]/50">
            <div className="flex items-center gap-2">
              <span className="text-[#A69B8C] text-sm">实付</span>
              <span className="text-[#A69374] text-lg font-medium">
                ¥{Number(order.payAmount).toFixed(2)}
              </span>
            </div>
            <div className="flex gap-2">
              {order.status === "PENDING" && (
                <>
                  <CancelButton orderId={order.id} />
                  <Link
                    href={`/pay?orderNo=${order.orderNo}`}
                    className="px-4 py-1.5 bg-[#A69374] text-white text-sm rounded-full hover:bg-[#917F62] transition-colors"
                  >
                    去付款
                  </Link>
                </>
              )}
              {order.status !== "PENDING" && (
                <Link
                  href={`/user/orders/${order.id}`}
                  className="px-4 py-1.5 border border-[#D4CFC6] text-[#7A6F5D] text-sm rounded-full hover:border-[#A69374] hover:text-[#A69374] transition-colors"
                >
                  查看详情
                </Link>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* 分页 */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-6">
          {pagination.page > 1 ? (
            <Link
              href={`/user/orders?${currentStatus !== "all" ? `status=${currentStatus}&` : ""}page=${pagination.page - 1}`}
              className="group flex items-center gap-1 px-4 py-2 bg-white/80 border border-[#E8E3DC] rounded-full text-[#7A6F5D] text-sm hover:border-[#C4BDB2] transition-colors"
            >
              <svg className="w-4 h-4 transform group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
              </svg>
              上一页
            </Link>
          ) : (
            <div className="px-4 py-2 text-[#C4BDB2] text-sm">上一页</div>
          )}

          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
              let pageNum: number;
              if (pagination.totalPages <= 5) {
                pageNum = i + 1;
              } else if (pagination.page <= 3) {
                pageNum = i + 1;
              } else if (pagination.page >= pagination.totalPages - 2) {
                pageNum = pagination.totalPages - 4 + i;
              } else {
                pageNum = pagination.page - 2 + i;
              }
              return (
                <Link
                  key={pageNum}
                  href={`/user/orders?${currentStatus !== "all" ? `status=${currentStatus}&` : ""}page=${pageNum}`}
                  className={`w-9 h-9 flex items-center justify-center rounded-full text-sm transition-colors ${pagination.page === pageNum
                      ? "bg-[#A69374] text-white"
                      : "text-[#8B8579] hover:text-[#5C5347] hover:bg-white/80"
                    }`}
                >
                  {pageNum}
                </Link>
              );
            })}
          </div>

          {pagination.page < pagination.totalPages ? (
            <Link
              href={`/user/orders?${currentStatus !== "all" ? `status=${currentStatus}&` : ""}page=${pagination.page + 1}`}
              className="group flex items-center gap-1 px-4 py-2 bg-white/80 border border-[#E8E3DC] rounded-full text-[#7A6F5D] text-sm hover:border-[#C4BDB2] transition-colors"
            >
              下一页
              <svg className="w-4 h-4 transform group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ) : (
            <div className="px-4 py-2 text-[#C4BDB2] text-sm">下一页</div>
          )}
        </div>
      )}
    </div>
  );
}

// 状态徽章组件
function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || {
    label: status,
    color: "text-[#8B8579]",
    bgColor: "bg-gray-100 border-gray-200",
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs border ${config.color} ${config.bgColor}`}>
      {config.label}
    </span>
  );
}

// 取消订单按钮
function CancelButton({ orderId }: { orderId: string }) {
  const [loading, setLoading] = useState(false);

  const handleCancel = async () => {
    if (!confirm("确定要取消此订单吗？")) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/cancel`, { method: "POST" });
      if (res.ok) {
        window.location.reload();
      }
    } catch (e) {
      console.error("取消失败:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleCancel}
      disabled={loading}
      className="px-4 py-1.5 border border-[#D4CFC6] text-[#8B8579] text-sm rounded-full hover:border-red-300 hover:text-red-500 transition-colors disabled:opacity-50"
    >
      {loading ? "取消中..." : "取消订单"}
    </button>
  );
}

