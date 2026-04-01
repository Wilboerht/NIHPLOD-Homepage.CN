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
  payAmount: number;
  createdAt: string;
  items: OrderItem[];
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING: { label: "待付款", color: "text-amber-600 bg-amber-500/10 border-amber-500/20" },
  PAID: { label: "已付款", color: "text-blue-600 bg-blue-500/10 border-blue-500/20" },
  SHIPPED: { label: "已发货", color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20" },
  COMPLETED: { label: "已完成", color: "text-brand-charcoal/80 bg-black/5 border-black/10" },
  CANCELLED: { label: "已取消", color: "text-brand-charcoal/50 bg-black/5 border-black/5" },
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

    const fetchOrders = async () => {
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
    };
    fetchOrders();

    return () => controller.abort();
  }, [activeTab, initialOrderId, clearInitialOrderId]);

  if (selectedOrder) {
    return <OrderDetail order={selectedOrder} onBack={() => setSelectedOrder(null)} />;
  }

  return (
    <div className="h-full flex flex-col pt-6 md:pt-10">
      <div className="flex-shrink-0 px-6 md:px-10 pb-2">
        <h2 className="text-2xl font-semibold tracking-[0.05em] text-brand-charcoal mb-6">
          我的订单
        </h2>

        {/* 导航标签 */}
        <div className="flex gap-2 p-1.5 bg-black/5 md:bg-white/30 rounded-2xl backdrop-blur-md border border-black/5 md:border-white/40">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative flex-1 py-2.5 text-[15px] font-medium rounded-xl transition-all ${activeTab === tab.key
                ? "text-[#8B7355]"
                : "text-brand-charcoal/50 hover:text-brand-charcoal/80"
                }`}
            >
              {activeTab === tab.key && (
                <m.div
                  layoutId="ordersTabActive"
                  className="absolute inset-0 bg-brand-gold/15 shadow-sm rounded-xl border border-brand-gold/30 backdrop-blur-md"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span className="relative z-10 tracking-wide">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-10 py-4 scrollbar-hide">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-brand-gold animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <m.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <div className="w-20 h-20 rounded-full bg-black/5 md:bg-white/30 backdrop-blur-md flex items-center justify-center mb-5 border border-black/5 md:border-white/40 shadow-inner">
              <Package className="w-9 h-9" style={{ color: "#B0B0B0" }} />
            </div>
            <p className="text-brand-charcoal/50 font-medium tracking-wide">暂无相关订单</p>
          </m.div>
        ) : (
          <div className="space-y-4 pb-10">
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
  const status = STATUS_CONFIG[order.status] || { label: order.status, color: "text-brand-charcoal/50 bg-black/5 border-black/5" };
  const firstItem = order.items[0];

  return (
    <button
      onClick={onClick}
      className="w-full bg-black/[0.02] md:bg-white/40 rounded-[1.25rem] p-5 border border-black/5 md:border-white/50 hover:bg-black/[0.04] md:hover:bg-white/60 transition-all text-left group backdrop-blur-md shadow-sm hover:shadow-md shadow-black/5"
    >
      <div className="flex items-center justify-between mb-4 border-b border-black/5 md:border-white/30 pb-3">
        <span className="text-brand-charcoal/40 text-[13px] font-mono tracking-wider">
          {order.orderNo}
        </span>
        <span className={`px-2.5 py-1 rounded-md text-[13px] font-medium border ${status.color}`}>
          {status.label}
        </span>
      </div>
      <div className="flex gap-4 items-center">
        <div className="w-20 h-20 rounded-xl overflow-hidden bg-black/5 md:bg-white/50 flex-shrink-0 border border-black/5 md:border-white/50 shadow-inner">
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
              <Package className="w-7 h-7" style={{ color: "#BDBDBD" }} />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <p className="text-brand-charcoal text-base font-semibold truncate tracking-wide group-hover:text-brand-gold transition-colors">
            {firstItem?.productName || "未知商品"}
          </p>
          {order.items.length > 1 && (
            <p className="text-brand-charcoal/50 text-[13px]">
              等 共 <span className="text-brand-charcoal font-medium">{order.items.length}</span> 件商品
            </p>
          )}
          <p className="text-brand-gold text-[17px] font-semibold mt-0.5 tracking-wider">
            ¥{Number(order.payAmount).toFixed(2)}
          </p>
        </div>
        <div className="w-8 h-8 rounded-full bg-black/5 md:bg-white/50 flex items-center justify-center group-hover:bg-brand-gold shrink-0 transition-colors">
          <ChevronRight className="w-4 h-4 text-brand-charcoal/30 group-hover:text-white transition-colors" />
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

        <div className="mt-8 bg-brand-charcoal/5 md:bg-white/40 rounded-2xl p-5 border border-brand-charcoal/5 md:border-brand-gold/20 backdrop-blur-md relative overflow-hidden">
          <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-brand-gold/10 to-transparent pointer-events-none" />
          <div className="flex items-center justify-between relative z-10">
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
