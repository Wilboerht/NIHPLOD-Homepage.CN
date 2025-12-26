"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Package, ChevronRight, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

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
  PENDING: { label: "待付款", color: "text-amber-600 bg-amber-50" },
  PAID: { label: "已付款", color: "text-blue-600 bg-blue-50" },
  SHIPPED: { label: "已发货", color: "text-emerald-600 bg-emerald-50" },
  COMPLETED: { label: "已完成", color: "text-[#A69374] bg-[#F5F2ED]" },
  CANCELLED: { label: "已取消", color: "text-gray-500 bg-gray-100" },
};

const TABS = [
  { key: "all", label: "全部" },
  { key: "PENDING", label: "待付款" },
  { key: "SHIPPED", label: "待收货" },
  { key: "COMPLETED", label: "已完成" },
];

export function OrdersPanel() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true);
      try {
        const url = activeTab === "all" ? "/api/orders" : `/api/orders?status=${activeTab}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.success) setOrders(data.data.orders || []);
      } catch (e) {
        console.error("获取订单失败:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, [activeTab]);

  if (selectedOrder) {
    return <OrderDetail order={selectedOrder} onBack={() => setSelectedOrder(null)} />;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 p-6 pb-0">
        <h2 className="text-xl text-[#5C5347] font-light mb-4">我的订单</h2>
        <div className="flex gap-1 p-1 bg-[#F5F2ED] rounded-lg">
          {TABS.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`flex-1 py-2 text-sm rounded-md transition-all ${activeTab === tab.key ? "bg-white text-[#5C5347] shadow-sm" : "text-[#8B8579] hover:text-[#5C5347]"}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6 pt-4">
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-[#A69374] animate-spin" /></div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto rounded-full bg-[#F5F2ED] flex items-center justify-center mb-4"><Package className="w-8 h-8 text-[#C4BDB2]" /></div>
            <p className="text-[#8B8579]">暂无订单</p>
          </div>
        ) : (
          <div className="space-y-3">{orders.map((order) => <OrderCard key={order.id} order={order} onClick={() => setSelectedOrder(order)} />)}</div>
        )}
      </div>
    </div>
  );
}

function OrderCard({ order, onClick }: { order: Order; onClick: () => void }) {
  const status = STATUS_CONFIG[order.status] || { label: order.status, color: "text-gray-500 bg-gray-100" };
  const firstItem = order.items[0];
  return (
    <button onClick={onClick} className="w-full bg-white/80 rounded-xl p-4 border border-[#E8E3DC] hover:border-[#C4BDB2] transition-all text-left group">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[#A69B8C] text-xs font-mono">{order.orderNo}</span>
        <span className={`px-2 py-0.5 rounded text-xs ${status.color}`}>{status.label}</span>
      </div>
      <div className="flex gap-3">
        <div className="w-16 h-16 rounded-lg overflow-hidden bg-[#F5F2ED] flex-shrink-0">
          {firstItem?.productImage ? <Image src={firstItem.productImage} alt="" width={64} height={64} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Package className="w-6 h-6 text-[#C4BDB2]" /></div>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[#5C5347] text-sm truncate">{firstItem?.productName || "商品"}</p>
          {order.items.length > 1 && <p className="text-[#A69B8C] text-xs mt-1">共 {order.items.length} 件商品</p>}
          <p className="text-[#A69374] text-sm mt-2">¥{Number(order.payAmount).toFixed(2)}</p>
        </div>
        <ChevronRight className="w-5 h-5 text-[#C4BDB2] group-hover:text-[#A69374] transition-colors self-center" />
      </div>
    </button>
  );
}

function OrderDetail({ order, onBack }: { order: Order; onBack: () => void }) {
  const { openPay, closeUserCenter } = useAuth();
  const status = STATUS_CONFIG[order.status] || { label: order.status, color: "text-gray-500 bg-gray-100" };

  const handlePay = () => {
    // 先打开支付模态框，再关闭用户中心（避免组件卸载导致的闭包问题）
    openPay(order.id);
    closeUserCenter();
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 p-6 pb-4 border-b border-[#E8E3DC]">
        <button onClick={onBack} className="flex items-center gap-2 text-[#8B8579] hover:text-[#5C5347] transition-colors mb-4">
          <ChevronRight className="w-4 h-4 rotate-180" /><span className="text-sm">返回订单列表</span>
        </button>
        <div className="flex items-center justify-between">
          <div><p className="text-[#A69B8C] text-xs">订单号</p><p className="text-[#5C5347] font-mono">{order.orderNo}</p></div>
          <span className={`px-3 py-1 rounded-full text-sm ${status.color}`}>{status.label}</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <p className="text-[#8B8579] text-sm mb-3">商品信息</p>
        <div className="space-y-3">
          {order.items.map((item) => (
            <div key={item.id} className="flex gap-3 bg-white/80 rounded-xl p-3 border border-[#E8E3DC]">
              <div className="w-16 h-16 rounded-lg overflow-hidden bg-[#F5F2ED] flex-shrink-0">
                {item.productImage ? <Image src={item.productImage} alt="" width={64} height={64} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Package className="w-6 h-6 text-[#C4BDB2]" /></div>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[#5C5347] text-sm truncate">{item.productName}</p>
                <div className="flex items-center justify-between mt-2"><span className="text-[#A69374]">¥{Number(item.price).toFixed(2)}</span><span className="text-[#A69B8C] text-sm">×{item.quantity}</span></div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 bg-white/80 rounded-xl p-4 border border-[#E8E3DC]">
          <div className="flex items-center justify-between"><span className="text-[#8B8579]">实付金额</span><span className="text-[#A69374] text-xl">¥{Number(order.payAmount).toFixed(2)}</span></div>
        </div>
        {/* 待付款订单显示付款按钮 */}
        {order.status === "PENDING" && (
          <button
            onClick={handlePay}
            className="w-full mt-6 py-3 bg-[#A69374] hover:bg-[#8B7A5E] text-white rounded-xl font-medium transition-colors"
          >
            立即付款
          </button>
        )}
      </div>
    </div>
  );
}

