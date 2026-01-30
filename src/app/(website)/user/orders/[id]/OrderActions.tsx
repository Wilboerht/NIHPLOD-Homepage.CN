
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";

interface OrderActionsProps {
    order: {
        id: string;
        orderNo: string;
        status: string;
    };
}

export default function OrderActions({ order }: OrderActionsProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const handleRefundApply = async () => {
        const reason = window.prompt("请输入退款原因：");
        if (!reason) return;

        setLoading(true);
        try {
            const res = await fetch(`/api/orders/${order.id}/refund`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason }),
            });
            const data = await res.json();
            if (data.success) {
                alert("退款申请已提交");
                router.refresh();
            } else {
                alert(data.error?.message || "申请失败");
            }
        } catch {
            alert("网络错误");
        } finally {
            setLoading(false);
        }
    };

    const handleRefundCancel = async () => {
        if (!confirm("确定要取消退款申请吗？")) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/orders/${order.id}/refund`, {
                method: "DELETE",
            });
            const data = await res.json();
            if (data.success) {
                alert("退款申请已取消");
                router.refresh();
            } else {
                alert(data.error?.message || "操作失败");
            }
        } catch {
            alert("网络错误");
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmReceipt = async () => {
        if (!confirm("确认已收到货物吗？此操作不可撤销。")) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/orders/${order.id}/confirm`, {
                method: "POST",
            });
            const data = await res.json();
            if (data.success) {
                alert("确认收货成功");
                router.refresh();
            } else {
                alert(data.error?.message || "操作失败");
            }
        } catch {
            alert("网络错误");
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-brand-brown/60">
                <Loader2 className="h-4 w-4 animate-spin" />
                处理中...
            </div>
        );
    }

    return (
        <div className="flex gap-3">
            {order.status === "PENDING" && (
                <Link
                    href={`/pay?orderNo=${order.orderNo}`}
                    className="flex-1 py-3 bg-[#A69374] text-white text-center rounded-xl font-medium hover:bg-[#917F62] transition-colors"
                >
                    去付款
                </Link>
            )}

            {(order.status === "PAID" || order.status === "SHIPPED") && (
                <button
                    onClick={handleRefundApply}
                    className="px-6 py-3 border border-[#D4CFC6] text-[#7A6F5D] rounded-xl hover:bg-gray-50 transition-colors"
                >
                    申请退款
                </button>
            )}

            {order.status === "SHIPPED" && (
                <button
                    onClick={handleConfirmReceipt}
                    className="flex-1 py-3 bg-[#A69374] text-white rounded-xl font-medium hover:bg-[#917F62] transition-colors"
                >
                    确认收货
                </button>
            )}

            {order.status === "REFUNDING" && (
                <button
                    onClick={handleRefundCancel}
                    className="flex-1 py-3 border border-red-200 text-red-600 rounded-xl hover:bg-red-50 transition-colors"
                >
                    取消退款申请
                </button>
            )}
        </div>
    );
}
