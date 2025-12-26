"use client";

/**
 * 订单详情页面
 */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Truck, XCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { LOGISTICS_COMPANIES } from "@/lib/logistics-constants";

interface OrderDetail {
  id: string;
  orderNo: string;
  status: string;
  totalAmount: string | number;
  discountAmount: string | number;
  shippingFee: string | number;
  payAmount: string | number;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  shippingCompany: string | null;
  trackingNo: string | null;
  adminNote: string | null;
  user: { id: string; nickname: string | null; phone: string | null };
  items: { id: string; productName: string; variantName: string | null; price: string | number; quantity: number }[];
  createdAt: string;
  paymentTime: string | null;
  shippedAt: string | null;
}

const STATUS_MAP: Record<string, { label: string; color: "default" | "warning" | "success" | "danger" | "primary" }> = {
  PENDING: { label: "待付款", color: "warning" },
  PAID: { label: "已支付", color: "primary" },
  PROCESSING: { label: "处理中", color: "primary" },
  SHIPPED: { label: "已发货", color: "success" },
  DELIVERED: { label: "已签收", color: "success" },
  COMPLETED: { label: "已完成", color: "default" },
  CANCELLED: { label: "已取消", color: "default" },
  REFUNDING: { label: "退款中", color: "danger" },
  REFUNDED: { label: "已退款", color: "default" },
};

export default function OrderDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showShipModal, setShowShipModal] = useState(false);
  const [shipForm, setShipForm] = useState({ logisticsCompany: "SF", trackingNo: "" });
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/orders/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setOrder(data.data.order);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleShip = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/orders/${id}/ship`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(shipForm),
      });
      const data = await res.json();
      if (data.success) {
        alert("发货成功");
        router.refresh();
        window.location.reload();
      } else {
        alert(data.error?.message || "发货失败");
      }
    } finally {
      setActionLoading(false);
      setShowShipModal(false);
    }
  };

  const handleRefund = async (approved: boolean) => {
    if (!confirm(approved ? "确认同意退款？" : "确认拒绝退款？")) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/orders/${id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved }),
      });
      const data = await res.json();
      if (data.success) {
        alert(approved ? "退款已批准" : "退款已拒绝");
        window.location.reload();
      } else {
        alert(data.error?.message || "操作失败");
      }
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-400">加载中...</div>;
  if (!order) return <div className="p-8 text-center text-gray-400">订单不存在</div>;

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/orders">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> 返回</Button>
          </Link>
          <h1 className="text-xl font-semibold">订单 {order.orderNo}</h1>
          <Badge variant={STATUS_MAP[order.status]?.color || "default"}>
            {STATUS_MAP[order.status]?.label || order.status}
          </Badge>
        </div>
        <div className="flex gap-2">
          {order.status === "PENDING_SHIPMENT" && (
            <Button onClick={() => setShowShipModal(true)}><Truck className="h-4 w-4 mr-1" /> 发货</Button>
          )}
          {order.status === "REFUNDING" && (
            <>
              <Button variant="primary" onClick={() => handleRefund(true)} disabled={actionLoading}>
                <CheckCircle className="h-4 w-4 mr-1" /> 同意退款
              </Button>
              <Button variant="outline" onClick={() => handleRefund(false)} disabled={actionLoading}>
                <XCircle className="h-4 w-4 mr-1" /> 拒绝
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 订单信息 */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* 基本信息 */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-medium">订单信息</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-gray-500">订单号</dt><dd>{order.orderNo}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">下单时间</dt><dd>{new Date(order.createdAt).toLocaleString("zh-CN")}</dd></div>
            {order.paymentTime && <div className="flex justify-between"><dt className="text-gray-500">支付时间</dt><dd>{new Date(order.paymentTime).toLocaleString("zh-CN")}</dd></div>}
            <div className="flex justify-between"><dt className="text-gray-500">用户</dt><dd>{order.user.nickname || order.user.phone}</dd></div>
          </dl>
        </div>

        {/* 收货信息 */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-medium">收货信息</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-gray-500">收货人</dt><dd>{order.recipientName}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">联系电话</dt><dd>{order.recipientPhone}</dd></div>
            <div><dt className="text-gray-500 mb-1">地址</dt><dd>{order.recipientAddress}</dd></div>
          </dl>
        </div>
      </div>

      {/* 商品列表 */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-medium">商品明细</h2>
        <table className="w-full text-sm">
          <thead className="border-b text-left text-gray-500">
            <tr>
              <th className="pb-2">商品</th>
              <th className="pb-2">规格</th>
              <th className="pb-2">单价</th>
              <th className="pb-2">数量</th>
              <th className="pb-2">小计</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {order.items.map((item) => (
              <tr key={item.id}>
                <td className="py-3">{item.productName}</td>
                <td className="py-3 text-gray-500">{item.variantName || "-"}</td>
                <td className="py-3">¥{Number(item.price).toFixed(2)}</td>
                <td className="py-3">{item.quantity}</td>
                <td className="py-3 text-pink-500">¥{(Number(item.price) * item.quantity).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t">
            <tr>
              <td colSpan={4} className="py-3 text-right text-gray-500">商品总额</td>
              <td className="py-3">¥{Number(order.totalAmount).toFixed(2)}</td>
            </tr>
            <tr>
              <td colSpan={4} className="py-1 text-right text-gray-500">运费</td>
              <td className="py-1">¥{Number(order.shippingFee).toFixed(2)}</td>
            </tr>
            <tr>
              <td colSpan={4} className="py-1 text-right text-gray-500">优惠</td>
              <td className="py-1 text-green-500">-¥{Number(order.discountAmount).toFixed(2)}</td>
            </tr>
            <tr>
              <td colSpan={4} className="py-3 text-right font-medium">实付金额</td>
              <td className="py-3 text-lg font-bold text-pink-500">¥{Number(order.payAmount).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 发货弹窗 */}
      {showShipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6">
            <h3 className="mb-4 text-lg font-medium">发货</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-gray-600">物流公司</label>
                <select
                  value={shipForm.logisticsCompany}
                  onChange={(e) => setShipForm((f) => ({ ...f, logisticsCompany: e.target.value }))}
                  className="w-full rounded-lg border p-2"
                >
                  {LOGISTICS_COMPANIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-600">快递单号</label>
                <input
                  type="text"
                  value={shipForm.trackingNo}
                  onChange={(e) => setShipForm((f) => ({ ...f, trackingNo: e.target.value }))}
                  placeholder="请输入快递单号"
                  className="w-full rounded-lg border p-2"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowShipModal(false)}>取消</Button>
              <Button onClick={handleShip} disabled={actionLoading || !shipForm.trackingNo}>
                {actionLoading ? "处理中..." : "确认发货"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

