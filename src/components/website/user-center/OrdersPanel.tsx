"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { Package, ChevronRight, Loader2, Truck, XCircle, CheckCircle, RotateCcw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { m } from "framer-motion";

interface OrderItem {
  id: string;
  productName: string;
  productImage: string | null;
  price: number;
  quantity: number;
}

interface Order {
  id: string;
  orderNo: string;
  status: string;
  totalAmount: number;
  discountAmount: number;
  payAmount: number;
  createdAt: string;
  items: OrderItem[];
  userCoupon?: {
    id: string;
    coupon: {
      name: string;
      type: string;
      value: number;
    };
  } | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING: { label: "待付款", color: "text-amber-800 bg-transparent border-amber-800/20" },
  PAYING: { label: "支付中", color: "text-blue-800 bg-transparent border-blue-800/20" },
  PAID: { label: "已付款", color: "text-stone-800 bg-transparent border-stone-800/20" },
  PROCESSING: { label: "处理中", color: "text-indigo-800 bg-transparent border-indigo-800/20" },
  SHIPPED: { label: "已发货", color: "text-emerald-800 bg-transparent border-emerald-800/20" },
  DELIVERED: { label: "已签收", color: "text-teal-800 bg-transparent border-teal-800/20" },
  COMPLETED: { label: "已完成", color: "text-stone-800 bg-transparent border-stone-200/60" },
  CANCELLED: { label: "已取消", color: "text-stone-400 bg-transparent border-stone-200/60" },
  REFUNDING: { label: "退款中", color: "text-orange-800 bg-transparent border-orange-800/20" },
  REFUNDED: { label: "已退款", color: "text-rose-800 bg-transparent border-rose-800/20" },
};

const TABS = [
  { key: "all", label: "全部" },
  { key: "PENDING", label: "待付款" },
  { key: "SHIPPED", label: "待收货" },
  { key: "COMPLETED", label: "已完成" },
];

export function OrdersPanel({ debounceMs = 250 }: { debounceMs?: number }) {
  const { initialOrderId, clearInitialOrderId } = useAuth();
  const { error: showError } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;

    // 视觉级防抖：延迟250ms执行，期间页签UI可随意滑动。
    // 这不仅拦截了无效的网络请求，更避免了快速点击时 Loading UI 的疯狂闪烁。
    const debounceTimer = setTimeout(async () => {
      setLoading(true);
      try {
        const url = activeTab === "all" ? "/api/orders" : `/api/orders?status=${activeTab}`;
        const res = await fetch(url, { signal: controller.signal });
        const data = await res.json();

        if (requestId !== requestIdRef.current) return;

        if (data.success) {
          const fetchedOrders = data.data.orders || [];
          setOrders(fetchedOrders);

          // 如果有初始订单 ID，自动选中该订单
          if (initialOrderId) {
            const targetOrder = fetchedOrders.find((o: Order) => o.id === initialOrderId);
            if (targetOrder) {
              setSelectedOrder(targetOrder);
            }
            clearInitialOrderId();
          }
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        console.error("获取订单失败:", e);
        showError("获取订单失败，请稍后重试");
      } finally {
        if (requestId !== requestIdRef.current) return;
        setLoading(false);
      }
    }, debounceMs);

    return () => {
      clearTimeout(debounceTimer);
      controller.abort();
    };
  }, [activeTab, initialOrderId, clearInitialOrderId, debounceMs]);

  if (selectedOrder) {
    return <OrderDetail order={selectedOrder} onBack={() => setSelectedOrder(null)} />;
  }

  return (
    <div className="flex h-full flex-col pt-4 md:pt-10">
      {/* 头部：单向排列避免与关闭按钮冲突 */}
      <div className="flex flex-shrink-0 flex-col items-start border-b-0 border-stone-200/60 px-16 pb-6 md:border-b">
        <h2 className="hidden text-xl font-medium tracking-wide text-stone-800 md:block">
          我的订单
        </h2>

        {/* 状态页签 */}
        <div className="scrollbar-hide mt-4 flex w-full gap-8 overflow-x-auto md:mt-8">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative whitespace-nowrap pb-2 text-[13px] tracking-wider transition-all ${
                activeTab === tab.key
                  ? "font-medium text-stone-800"
                  : "font-light text-stone-400 hover:text-stone-800"
              }`}
            >
              {activeTab === tab.key && (
                <m.div
                  layoutId="ordersTabActive"
                  className="absolute bottom-0 left-0 right-0 h-[1.5px] rounded-full bg-stone-800"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span className="relative z-10">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="scrollbar-hide relative flex flex-1 flex-col overflow-y-auto px-16 py-6">
        {/* 持久化加载遮罩层 - 防止 DOM 塌陷导致高度抖动 */}
        {loading && orders.length > 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#FBF8F0]/60 backdrop-blur-[2px]">
            <Loader2 className="h-8 w-8 animate-spin text-stone-500" />
          </div>
        )}

        {loading && orders.length === 0 ? (
          <div className="flex flex-1 items-center justify-center pb-28">
            <Loader2 className="h-8 w-8 animate-spin text-stone-300" />
          </div>
        ) : orders.length === 0 ? (
          <m.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-1 flex-col items-center justify-center pb-28 text-center"
          >
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-stone-200/60 bg-[#FBF8F0]/60 backdrop-blur-sm">
              <Package className="h-6 w-6 text-stone-300" />
            </div>
            <p className="text-sm tracking-wider text-stone-400">暂无相关订单</p>
          </m.div>
        ) : (
          <div
            className={`w-full space-y-0 pb-10 transition-opacity duration-300 ${loading ? "opacity-40" : "opacity-100"}`}
          >
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} onClick={() => setSelectedOrder(order)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OrderCard({ order, onClick }: { order: Order; onClick: () => void }) {
  const status = STATUS_CONFIG[order.status] || {
    label: order.status,
    color: "text-stone-400 bg-transparent border-transparent",
  };
  const firstItem = order.items[0];

  return (
    <button
      onClick={onClick}
      className="group -mx-6 w-full rounded-[2.5rem] border-b border-stone-200/60 px-6 py-6 text-left transition-all last:border-b-0 hover:bg-white/40"
    >
      <div className="mb-4 flex items-start justify-between px-2">
        <div className="flex flex-col">
          <span className="mb-1 font-mono text-xs tracking-wider text-stone-400">
            {order.orderNo}
          </span>
          <span className={`rounded border px-2 py-0.5 text-[11px] ${status.color} w-fit`}>
            {status.label}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <div className="text-sm font-medium tabular-nums tracking-wider text-stone-800">
            ¥{Number(order.payAmount).toFixed(2)}
          </div>
          {Number(order.discountAmount) > 0 && (
            <span className="mt-0.5 text-[11px] text-green-600">
              已优惠 ¥{Number(order.discountAmount).toFixed(2)}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-5 px-2">
        <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden bg-stone-100">
          {firstItem?.productImage ? (
            <Image
              src={firstItem.productImage}
              alt={firstItem.productName}
              width={80}
              height={80}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Package className="h-6 w-6 text-stone-300" />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="truncate text-sm font-medium tracking-wide text-stone-800 transition-colors group-hover:text-stone-600">
            {firstItem?.productName || "未知商品"}
          </h3>
          {order.items.length > 1 && (
            <p className="text-xs tracking-wider text-stone-400">
              等 共 {order.items.length} 件商品
            </p>
          )}
        </div>

        <div className="flex h-8 w-8 -translate-x-2 items-center justify-center opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100">
          <ChevronRight className="h-4 w-4 text-stone-400" />
        </div>
      </div>
    </button>
  );
}

function OrderDetail({ order, onBack }: { order: Order; onBack: () => void }) {
  const { openPay, closeUserCenter } = useAuth();
  const { success: showSuccess, error: showError } = useToast();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState(order.status);
  const status = STATUS_CONFIG[currentStatus] || {
    label: currentStatus,
    color: "text-brand-charcoal/50 bg-black/5 border-black/5",
  };

  const handlePay = () => {
    openPay(order.id);
    closeUserCenter();
  };

  const handleCancel = useCallback(async () => {
    if (!window.confirm("确定要取消该订单吗？")) return;
    setActionLoading("cancel");
    try {
      const res = await fetchWithAuth(`/api/orders/${order.id}/cancel`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        showSuccess("订单已取消");
        setCurrentStatus("CANCELLED");
      } else {
        showError(data.error?.message || "取消失败");
      }
    } catch {
      showError("网络错误，请稍后重试");
    } finally {
      setActionLoading(null);
    }
  }, [order.id, showSuccess, showError]);

  const handleConfirmReceipt = useCallback(async () => {
    if (!window.confirm("确认已收到商品吗？")) return;
    setActionLoading("confirm");
    try {
      const res = await fetchWithAuth(`/api/orders/${order.id}/confirm`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        showSuccess("已确认收货");
        setCurrentStatus("COMPLETED");
      } else {
        showError(data.error?.message || "操作失败");
      }
    } catch {
      showError("网络错误，请稍后重试");
    } finally {
      setActionLoading(null);
    }
  }, [order.id, showSuccess, showError]);

  const handleRefund = useCallback(async () => {
    const reason = window.prompt("请输入退款原因：");
    if (reason === null) return;
    if (!reason.trim()) {
      showError("请填写退款原因");
      return;
    }
    setActionLoading("refund");
    try {
      const res = await fetchWithAuth(`/api/orders/${order.id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        showSuccess("退款申请已提交");
        setCurrentStatus("REFUNDING");
      } else {
        showError(data.error?.message || "申请失败");
      }
    } catch {
      showError("网络错误，请稍后重试");
    } finally {
      setActionLoading(null);
    }
  }, [order.id, showSuccess, showError]);

  const handleQueryPayment = useCallback(async () => {
    setActionLoading("query");
    try {
      const res = await fetchWithAuth(`/api/orders/${order.id}/query-payment`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success && data.data?.fulfilled) {
        showSuccess("订单已支付");
        setCurrentStatus("PAID");
      } else {
        showError(data.data?.message || "订单尚未支付");
      }
    } catch {
      showError("网络错误，请稍后重试");
    } finally {
      setActionLoading(null);
    }
  }, [order.id, showSuccess, showError]);

  return (
    <div className="flex h-full flex-col pt-6 md:pt-10">
      <div className="flex-shrink-0 border-b border-black/5 px-6 pb-5 md:border-white/30 md:px-10">
        <button
          onClick={onBack}
          className="group mb-6 flex items-center gap-2 text-brand-charcoal/50 transition-colors hover:text-brand-charcoal"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-black/5 transition-colors group-hover:bg-black/10 md:bg-white/40">
            <ChevronRight className="h-4 w-4 rotate-180" />
          </div>
          <span className="text-[14px] font-medium tracking-wide">返回订单列表</span>
        </button>
        <div className="flex items-center justify-between">
          <div>
            <p className="mb-0.5 text-[12px] font-medium uppercase tracking-wide text-brand-charcoal/40">
              订单号
            </p>
            <p className="font-mono text-[16px] font-medium text-brand-charcoal">{order.orderNo}</p>
          </div>
          <span
            className={`rounded-lg border px-3.5 py-1.5 text-[13px] font-semibold ${status.color}`}
          >
            {status.label}
          </span>
        </div>
      </div>
      <div className="scrollbar-hide flex-1 overflow-y-auto px-6 py-6 md:px-10">
        <div className="mb-6">
          <p className="mb-4 text-[13px] font-bold uppercase tracking-[0.1em] text-brand-charcoal/50">
            商品信息
          </p>
          <div className="space-y-4">
            {order.items.map((item) => (
              <div
                key={item.id}
                className="flex gap-4 rounded-2xl border border-black/5 bg-black/[0.02] p-4 backdrop-blur-sm md:border-white/40 md:bg-white/30"
              >
                <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl border border-black/5 bg-black/5 shadow-inner md:border-white/50 md:bg-white/50">
                  {item.productImage ? (
                    <Image
                      src={item.productImage}
                      alt={item.productName}
                      width={80}
                      height={80}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Package className="h-7 w-7" style={{ color: "#BDBDBD" }} />
                    </div>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
                  <p className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-wide text-brand-charcoal">
                    {item.productName}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-[16px] font-medium tracking-wider text-brand-primary">
                      ¥{Number(item.price).toFixed(2)}
                    </span>
                    <span className="rounded-md bg-black/5 px-2 py-0.5 text-[14px] font-medium text-brand-charcoal/40 md:bg-white/50">
                      ×{item.quantity}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 价格明细 */}
        <div className="relative mt-8 space-y-2 overflow-hidden rounded-2xl border border-brand-charcoal/5 bg-brand-charcoal/5 p-5 backdrop-blur-md md:border-brand-primary/20 md:bg-white/40">
          <div className="pointer-events-none absolute bottom-0 right-0 top-0 w-32 bg-gradient-to-l from-brand-primary/10 to-transparent" />
          <div className="relative z-10 flex items-center justify-between text-sm">
            <span className="text-brand-charcoal/50">商品总额</span>
            <span className="text-brand-charcoal/70">¥{Number(order.totalAmount).toFixed(2)}</span>
          </div>
          {Number(order.discountAmount) > 0 && (
            <>
              <div className="relative z-10 flex items-center justify-between text-sm">
                <span className="text-brand-charcoal/50">
                  优惠券优惠{" "}
                  {order.userCoupon?.coupon.name ? `(${order.userCoupon.coupon.name})` : ""}
                </span>
                <span className="text-green-600">-¥{Number(order.discountAmount).toFixed(2)}</span>
              </div>
            </>
          )}
          <div className="relative z-10 flex items-center justify-between border-t border-brand-charcoal/10 pt-2">
            <span className="text-[14px] font-medium tracking-wide text-brand-charcoal/60">
              实付总额
            </span>
            <span className="relative text-2xl font-bold tracking-wider text-brand-primary">
              <span className="mr-1 text-[16px]">¥</span>
              {Number(order.payAmount).toFixed(2)}
            </span>
          </div>
        </div>

        {/* 订单操作按钮 */}
        <div className="mt-8 space-y-3">
          {/* 待付款：付款 + 刷新支付状态 + 取消 */}
          {(currentStatus === "PENDING" || currentStatus === "PAYING") && (
            <>
              <button
                onClick={handlePay}
                disabled={actionLoading !== null}
                className="w-full rounded-xl bg-brand-primary py-4 text-[15px] font-bold uppercase tracking-[0.2em] text-white shadow-lg shadow-brand-primary/20 transition-all hover:scale-[1.02] hover:bg-brand-primary-dark active:scale-[0.98] disabled:opacity-50"
              >
                立即付款
              </button>
              <button
                onClick={handleQueryPayment}
                disabled={actionLoading !== null}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-300/60 py-3.5 text-[14px] font-medium tracking-wide text-stone-500 transition-all hover:border-[#A69374] hover:text-[#A69374] disabled:opacity-50"
              >
                {actionLoading === "query" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                刷新支付状态
              </button>
              <button
                onClick={handleCancel}
                disabled={actionLoading !== null}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-300/60 py-3.5 text-[14px] font-medium tracking-wide text-stone-500 transition-all hover:border-stone-400 hover:text-stone-700 disabled:opacity-50"
              >
                {actionLoading === "cancel" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                取消订单
              </button>
            </>
          )}

          {/* 已发货：确认收货 + 申请退款 */}
          {currentStatus === "SHIPPED" && (
            <>
              <button
                onClick={handleConfirmReceipt}
                disabled={actionLoading !== null}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary py-4 text-[15px] font-bold tracking-[0.15em] text-white shadow-lg shadow-brand-primary/20 transition-all hover:scale-[1.02] hover:bg-brand-primary-dark active:scale-[0.98] disabled:opacity-50"
              >
                {actionLoading === "confirm" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                确认收货
              </button>
              <button
                onClick={handleRefund}
                disabled={actionLoading !== null}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-300/60 py-3.5 text-[14px] font-medium tracking-wide text-stone-500 transition-all hover:border-orange-300 hover:text-orange-600 disabled:opacity-50"
              >
                {actionLoading === "refund" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                申请退款
              </button>
            </>
          )}

          {/* 已付款/处理中：申请退款 */}
          {(currentStatus === "PAID" || currentStatus === "PROCESSING") && (
            <button
              onClick={handleRefund}
              disabled={actionLoading !== null}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-300/60 py-3.5 text-[14px] font-medium tracking-wide text-stone-500 transition-all hover:border-orange-300 hover:text-orange-600 disabled:opacity-50"
            >
              {actionLoading === "refund" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              申请退款
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
