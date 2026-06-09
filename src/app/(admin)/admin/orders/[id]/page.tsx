"use client";

/**
 * 订单详情页面
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Truck, XCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { LOGISTICS_COMPANIES } from "@/lib/logistics-constants";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPost, apiPatch } from "@/lib/api-client";

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
  remark: string | null;
  adminNote: string | null;
  paymentMethod: string | null;
  paymentNo: string | null;
  previousStatus: string | null;
  refundStatus: string | null;
  refundNo: string | null;
  refundAmount: string | number | null;
  refundTime: string | null;
  receivedAt: string | null;
  user: { id: string; nickname: string | null; phone: string | null };
  items: { id: string; productName: string; productImage: string | null; price: string | number; quantity: number }[];
  userCoupon?: {
    id: string;
    coupon: {
      name: string;
      type: string;
      value: number;
    };
  } | null;
  createdAt: string;
  paymentTime: string | null;
  shippedAt: string | null;
}

const REFUND_STATUS_LABELS: Record<string, string> = {
  PENDING: "退款待处理",
  SUCCESS: "退款成功",
  FAILED: "退款失败",
  CLOSED: "退款关闭",
};

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
  const { success, error } = useToast();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showShipModal, setShowShipModal] = useState(false);
  const [shipForm, setShipForm] = useState({ logisticsCompany: "SF", trackingNo: "" });
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundAction, setRefundAction] = useState<boolean | null>(null);
  const [refundRemark, setRefundRemark] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [editingAdminNote, setEditingAdminNote] = useState(false);
  const [adminNoteInput, setAdminNoteInput] = useState("");

  useEffect(() => {
    apiGet<{ order: OrderDetail }>(`/api/admin/orders/${id}`)
      .then((data) => setOrder(data.order))
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [id]);

  const refreshOrder = async () => {
    try {
      const data = await apiGet<{ order: OrderDetail }>(`/api/admin/orders/${id}`);
      setOrder(data.order);
    } catch {
      error("刷新订单数据失败");
    }
  };

  const handleShip = async () => {
    setActionLoading(true);
    try {
      await apiPost(`/api/admin/orders/${id}/ship`, shipForm);
      success("发货成功");
      setShowShipModal(false);
      await refreshOrder();
    } catch (err) {
      error(err instanceof Error ? err.message : "发货失败");
    } finally {
      setActionLoading(false);
    }
  };

  const openRefundModal = (approved: boolean) => {
    setRefundAction(approved);
    setRefundRemark("");
    setShowRefundModal(true);
  };

  const handleRefund = async () => {
    if (refundAction === null) return;
    setActionLoading(true);
    try {
      await apiPost(`/api/admin/orders/${id}/refund`, {
        approved: refundAction,
        adminRemark: refundRemark.trim() || undefined,
      });
      success(refundAction ? "退款已批准" : "退款已拒绝");
      setShowRefundModal(false);
      setRefundAction(null);
      await refreshOrder();
    } catch (err) {
      error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveAdminNote = async () => {
    setActionLoading(true);
    try {
      await apiPatch(`/api/admin/orders/${id}`, { adminNote: adminNoteInput.trim() || null });
      success("管理备注已保存");
      setEditingAdminNote(false);
      await refreshOrder();
    } catch (err) {
      error(err instanceof Error ? err.message : "保存失败");
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
          {(order.status === "PAID" || order.status === "PROCESSING") && (
            <Button onClick={() => setShowShipModal(true)}><Truck className="h-4 w-4 mr-1" /> 发货</Button>
          )}
          {order.status === "REFUNDING" && (
            <>
              <Button variant="primary" onClick={() => openRefundModal(true)} disabled={actionLoading}>
                <CheckCircle className="h-4 w-4 mr-1" /> 同意退款
              </Button>
              <Button variant="outline" onClick={() => openRefundModal(false)} disabled={actionLoading}>
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
            {order.receivedAt && <div className="flex justify-between"><dt className="text-gray-500">签收时间</dt><dd>{new Date(order.receivedAt).toLocaleString("zh-CN")}</dd></div>}
            <div className="flex justify-between"><dt className="text-gray-500">用户</dt><dd>{order.user.nickname || order.user.phone}</dd></div>
            {order.paymentMethod && <div className="flex justify-between"><dt className="text-gray-500">支付方式</dt><dd>{order.paymentMethod === "wechat" ? "微信支付" : order.paymentMethod === "alipay" ? "支付宝" : order.paymentMethod}</dd></div>}
            {order.paymentNo && <div className="flex justify-between"><dt className="text-gray-500">支付流水号</dt><dd className="font-mono text-xs">{order.paymentNo}</dd></div>}
            {order.remark && (
              <div className="pt-2 border-t">
                <dt className="text-gray-500 mb-1">用户备注</dt>
                <dd className="text-gray-700 bg-yellow-50 rounded-lg p-2">{order.remark}</dd>
              </div>
            )}
            {order.refundStatus && (
              <div className="pt-2 border-t">
                <div className="flex justify-between"><dt className="text-gray-500">退款状态</dt><dd><Badge variant={order.refundStatus === "SUCCESS" ? "success" : order.refundStatus === "FAILED" ? "danger" : "warning"}>{REFUND_STATUS_LABELS[order.refundStatus] || order.refundStatus}</Badge></dd></div>
                {order.refundNo && <div className="flex justify-between mt-1"><dt className="text-gray-500">退款单号</dt><dd className="font-mono text-xs">{order.refundNo}</dd></div>}
                {order.refundAmount && <div className="flex justify-between mt-1"><dt className="text-gray-500">退款金额</dt><dd>¥{Number(order.refundAmount).toFixed(2)}</dd></div>}
                {order.refundTime && <div className="flex justify-between mt-1"><dt className="text-gray-500">退款时间</dt><dd>{new Date(order.refundTime).toLocaleString("zh-CN")}</dd></div>}
              </div>
            )}
          </dl>
        </div>

        {/* 收货信息 */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-medium">收货信息</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-gray-500">收货人</dt><dd>{order.recipientName}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">联系电话</dt><dd>{order.recipientPhone}</dd></div>
            <div><dt className="text-gray-500 mb-1">地址</dt><dd>{order.recipientAddress}</dd></div>
            {order.shippingCompany && (
              <div className="pt-2 border-t">
                <div className="flex justify-between"><dt className="text-gray-500">物流公司</dt><dd>{order.shippingCompany}</dd></div>
                {order.trackingNo && <div className="flex justify-between mt-1"><dt className="text-gray-500">快递单号</dt><dd className="font-mono">{order.trackingNo}</dd></div>}
              </div>
            )}
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
              <th className="pb-2">单价</th>
              <th className="pb-2">数量</th>
              <th className="pb-2">小计</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {order.items.map((item) => (
              <tr key={item.id}>
                <td className="py-3">{item.productName}</td>
                <td className="py-3">¥{Number(item.price).toFixed(2)}</td>
                <td className="py-3">{item.quantity}</td>
                <td className="py-3 text-pink-500">¥{(Number(item.price) * item.quantity).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t">
            <tr>
              <td colSpan={3} className="py-3 text-right text-gray-500">商品总额</td>
              <td className="py-3">¥{Number(order.totalAmount).toFixed(2)}</td>
            </tr>
            <tr>
              <td colSpan={3} className="py-1 text-right text-gray-500">运费</td>
              <td className="py-1">¥{Number(order.shippingFee).toFixed(2)}</td>
            </tr>
            {Number(order.discountAmount) > 0 && (
              <tr>
                <td colSpan={3} className="py-1 text-right text-gray-500">
                  优惠 {order.userCoupon?.coupon.name ? `(${order.userCoupon.coupon.name})` : ""}
                </td>
                <td className="py-1 text-green-500">-¥{Number(order.discountAmount).toFixed(2)}</td>
              </tr>
            )}
            <tr>
              <td colSpan={3} className="py-3 text-right font-medium">实付金额</td>
              <td className="py-3 text-lg font-bold text-pink-500">¥{Number(order.payAmount).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 管理备注 */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-medium">管理备注</h2>
        {editingAdminNote ? (
          <div className="space-y-3">
            <textarea
              value={adminNoteInput}
              onChange={(e) => setAdminNoteInput(e.target.value)}
              placeholder="输入内部备注信息..."
              rows={3}
              className="w-full rounded-lg border p-3 text-sm focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setEditingAdminNote(false); setAdminNoteInput(order.adminNote || ""); }}>取消</Button>
              <Button size="sm" onClick={handleSaveAdminNote} loading={actionLoading}>保存</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {order.adminNote ? (
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{order.adminNote}</p>
            ) : (
              <p className="text-sm text-gray-400">暂无备注</p>
            )}
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => { setAdminNoteInput(order.adminNote || ""); setEditingAdminNote(true); }}>
                {order.adminNote ? "编辑备注" : "添加备注"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 发货弹窗 - 使用 Portal 渲染到 body，确保遮罩覆盖整个视口 */}
      {showShipModal && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
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
        </div>,
        document.body
      )}

      {/* 退款审批弹窗 */}
      {showRefundModal && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-medium">
              {refundAction ? "同意退款" : "拒绝退款"}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-gray-600">备注（可选）</label>
                <textarea
                  value={refundRemark}
                  onChange={(e) => setRefundRemark(e.target.value)}
                  placeholder="请输入退款备注..."
                  rows={3}
                  className="w-full rounded-lg border p-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowRefundModal(false)}>取消</Button>
              <Button
                variant={refundAction ? "primary" : "outline"}
                onClick={handleRefund}
                disabled={actionLoading}
              >
                {actionLoading ? "处理中..." : refundAction ? "确认同意" : "确认拒绝"}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

