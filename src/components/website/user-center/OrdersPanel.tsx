"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Package, ChevronRight, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
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
  PAID: { label: "已付款", color: "text-stone-800 bg-transparent border-stone-800/20" },
  SHIPPED: { label: "已发货", color: "text-emerald-800 bg-transparent border-emerald-800/20" },
  COMPLETED: { label: "已完成", color: "text-stone-800 bg-transparent border-stone-200/60" },
  CANCELLED: { label: "已取消", color: "text-stone-400 bg-transparent border-stone-200/60" },
};

const TABS = [
  { key: "all", label: "全部" },
  { key: "PENDING", label: "待付款" },
  { key: "SHIPPED", label: "待收货" },
  { key: "COMPLETED", label: "已完成" },
];

export function OrdersPanel() {
  const { initialOrderId, clearInitialOrderId } = useAuth();
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
      } finally {
        if (requestId !== requestIdRef.current) return;
        setLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(debounceTimer);
      controller.abort();
    };
  }, [activeTab, initialOrderId, clearInitialOrderId]);

  if (selectedOrder) {
    return <OrderDetail order={selectedOrder} onBack={() => setSelectedOrder(null)} />;
  }

  return (
    <div className="h-full flex flex-col pt-4 md:pt-10">
      {/* 头部：单向排列避免与关闭按钮冲突 */}
      <div className="flex-shrink-0 px-16 pb-6 border-b-0 md:border-b border-stone-200/60 flex flex-col items-start">
        <h2 className="hidden md:block text-xl font-medium tracking-wide text-stone-800">我的订单</h2>
        
        {/* 状态页签 */}
        <div className="mt-4 md:mt-8 flex gap-8 w-full overflow-x-auto scrollbar-hide">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-2 text-[13px] tracking-wider transition-all whitespace-nowrap relative ${
                activeTab === tab.key
                  ? "text-stone-800 font-medium"
                  : "text-stone-400 hover:text-stone-800 font-light"
              }`}
            >
              {activeTab === tab.key && (
                <m.div
                  layoutId="ordersTabActive"
                  className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-stone-800 rounded-full"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span className="relative z-10">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-16 py-6 scrollbar-hide flex flex-col relative">
        {/* 持久化加载遮罩层 - 防止 DOM 塌陷导致高度抖动 */}
        {loading && orders.length > 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#F8F7F3]/60 backdrop-blur-[2px]">
            <Loader2 className="w-8 h-8 text-stone-500 animate-spin" />
          </div>
        )}

        {loading && orders.length === 0 ? (
          <div className="flex-1 flex items-center justify-center pb-28">
            <Loader2 className="w-8 h-8 text-stone-300 animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <m.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex flex-col items-center justify-center pb-28 text-center"
          >
            <div className="w-16 h-16 rounded-full bg-[#F8F7F3]/60 backdrop-blur-sm border border-stone-200/60 flex items-center justify-center mb-5">
              <Package className="w-6 h-6 text-stone-300" />
            </div>
            <p className="text-stone-400 text-sm tracking-wider">暂无相关订单</p>
          </m.div>
        ) : (
          <div className={`space-y-0 pb-10 w-full transition-opacity duration-300 ${loading ? 'opacity-40' : 'opacity-100'}`}>
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
  const status = STATUS_CONFIG[order.status] || { label: order.status, color: "text-stone-400 bg-transparent border-transparent" };
  const firstItem = order.items[0];

  return (
    <button
      onClick={onClick}
      className="w-full text-left group border-b border-stone-200/60 last:border-b-0 py-6 px-6 -mx-6 rounded-[2.5rem] transition-all hover:bg-white/40"
    >
      <div className="flex justify-between items-start mb-4 px-2">
        <div className="flex flex-col">
          <span className="text-xs text-stone-400 font-mono tracking-wider mb-1">
            {order.orderNo}
          </span>
          <span className={`text-[11px] px-2 py-0.5 rounded border ${status.color} w-fit`}>
            {status.label}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <div className="text-sm font-medium tracking-wider text-stone-800 tabular-nums">
            ¥{Number(order.payAmount).toFixed(2)}
          </div>
          {Number(order.discountAmount) > 0 && (
            <span className="text-[11px] text-green-600 mt-0.5">
              已优惠 ¥{Number(order.discountAmount).toFixed(2)}
            </span>
          )}
        </div>
      </div>
      
      <div className="flex gap-5 items-center px-2">
        <div className="w-20 h-20 bg-stone-100 flex-shrink-0 relative overflow-hidden">
          {firstItem?.productImage ? (
            <Image
              src={firstItem.productImage}
              alt={firstItem.productName}
              width={80}
              height={80}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="w-6 h-6 text-stone-300" />
            </div>
          )}
        </div>
        
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <h3 className="text-sm font-medium text-stone-800 truncate tracking-wide group-hover:text-stone-600 transition-colors">
            {firstItem?.productName || "未知商品"}
          </h3>
          {order.items.length > 1 && (
            <p className="text-xs text-stone-400 tracking-wider">
              等 共 {order.items.length} 件商品
            </p>
          )}
        </div>
        
        <div className="w-8 h-8 flex justify-center items-center opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all duration-300">
          <ChevronRight className="w-4 h-4 text-stone-400" />
        </div>
      </div>
    </button>
  );
}

function OrderDetail({ order, onBack }: { order: Order; onBack: () => void }) {
  const { openPay, closeUserCenter } = useAuth();
  const status = STATUS_CONFIG[order.status] || { label: order.status, color: "text-brand-charcoal/50 bg-black/5 border-black/5" };

  const handlePay = () => {
    // 先打开支付模态框，再关闭用户中心（避免组件卸载导致的闭包问题）
    openPay(order.id);
    closeUserCenter();
  };

  return (
    <div className="h-full flex flex-col pt-6 md:pt-10">
      <div className="flex-shrink-0 px-6 md:px-10 pb-5 border-b border-black/5 md:border-white/30">
        <button
          onClick={onBack}
          className="group flex items-center gap-2 text-brand-charcoal/50 hover:text-brand-charcoal transition-colors mb-6"
        >
          <div className="w-7 h-7 rounded-full bg-black/5 md:bg-white/40 flex items-center justify-center group-hover:bg-black/10 transition-colors">
            <ChevronRight className="w-4 h-4 rotate-180" />
          </div>
          <span className="text-[14px] font-medium tracking-wide">返回订单列表</span>
        </button>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-brand-charcoal/40 text-[12px] font-medium tracking-wide uppercase mb-0.5">订单号</p>
            <p className="text-brand-charcoal text-[16px] font-mono font-medium">{order.orderNo}</p>
          </div>
          <span className={`px-3.5 py-1.5 rounded-lg text-[13px] font-semibold border ${status.color}`}>
            {status.label}
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 md:px-10 py-6 scrollbar-hide">
        <div className="mb-6">
          <p className="text-brand-charcoal/50 text-[13px] font-bold tracking-[0.1em] uppercase mb-4">商品信息</p>
          <div className="space-y-4">
            {order.items.map((item) => (
              <div
                key={item.id}
                className="flex gap-4 bg-black/[0.02] md:bg-white/30 rounded-2xl p-4 border border-black/5 md:border-white/40 backdrop-blur-sm"
              >
                <div className="w-20 h-20 rounded-xl overflow-hidden bg-black/5 md:bg-white/50 flex-shrink-0 border border-black/5 md:border-white/50 shadow-inner">
                  {item.productImage ? (
                    <Image
                      src={item.productImage}
                      alt={item.productName}
                      width={80}
                      height={80}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-7 h-7" style={{ color: "#BDBDBD" }} />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center gap-2">
                  <p className="text-brand-charcoal text-[15px] font-semibold leading-snug tracking-wide line-clamp-2">
                    {item.productName}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-brand-gold font-medium tracking-wider text-[16px]">
                      ¥{Number(item.price).toFixed(2)}
                    </span>
                    <span className="text-brand-charcoal/40 text-[14px] font-medium bg-black/5 md:bg-white/50 px-2 py-0.5 rounded-md">
                      ×{item.quantity}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 价格明细 */}
        <div className="mt-8 bg-brand-charcoal/5 md:bg-white/40 rounded-2xl p-5 border border-brand-charcoal/5 md:border-brand-gold/20 backdrop-blur-md relative overflow-hidden space-y-2">
          <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-brand-gold/10 to-transparent pointer-events-none" />
          <div className="flex items-center justify-between relative z-10 text-sm">
            <span className="text-brand-charcoal/50">商品总额</span>
            <span className="text-brand-charcoal/70">¥{Number(order.totalAmount).toFixed(2)}</span>
          </div>
          {Number(order.discountAmount) > 0 && (
            <>
              <div className="flex items-center justify-between relative z-10 text-sm">
                <span className="text-brand-charcoal/50">
                  优惠券优惠 {order.userCoupon?.coupon.name ? `(${order.userCoupon.coupon.name})` : ""}
                </span>
                <span className="text-green-600">-¥{Number(order.discountAmount).toFixed(2)}</span>
              </div>
            </>
          )}
          <div className="flex items-center justify-between relative z-10 pt-2 border-t border-brand-charcoal/10">
            <span className="text-brand-charcoal/60 text-[14px] font-medium tracking-wide">实付总额</span>
            <span className="text-brand-gold text-2xl font-bold tracking-wider relative">
              <span className="text-[16px] mr-1">¥</span>
              {Number(order.payAmount).toFixed(2)}
            </span>
          </div>
        </div>

        {/* 待付款订单显示付款按钮 */}
        {order.status === "PENDING" && (
          <button
            onClick={handlePay}
            className="w-full mt-8 py-4 bg-brand-gold text-white rounded-xl text-[15px] font-bold tracking-[0.2em] shadow-lg shadow-brand-gold/20 transition-all hover:bg-brand-gold-dark hover:scale-[1.02] active:scale-[0.98] uppercase"
          >
            立即付款
          </button>
        )}
      </div>
    </div>
  );
}
