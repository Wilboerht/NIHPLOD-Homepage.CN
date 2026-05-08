
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Users, Pencil, Trash2, Power, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toISOString().split('T')[0];
};

interface Coupon {
    id: string;
    name: string;
    code: string | null;
    type: string;
    value: number;
    minAmount: number;
    startDate: string | null;
    endDate: string | null;
    daysValid: number | null;
    totalLimit: number | null;
    isActive: boolean;
    _count: {
        userCoupons: number;
    };
    userCoupons: { id: string }[];
}

export default function AdminCouponsPage() {
    const [coupons, setCoupons] = useState<Coupon[]>([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
    const { success, error } = useToast();

    const fetchCoupons = useCallback(async (page = 1) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/coupons?page=${page}&pageSize=20`);
            const data = await res.json();
            if (data.success) {
                setCoupons(data.data.coupons);
                setPagination(data.data.pagination);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCoupons(1);
    }, [fetchCoupons]);

    const handleToggleActive = async (id: string, current: boolean) => {
        try {
            const res = await fetch(`/api/admin/coupons/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: !current }),
            });
            const data = await res.json();
            if (data.success) {
                success(current ? "已下架" : "已上架");
                fetchCoupons(pagination.page);
            } else {
                error(data.error?.message || "操作失败");
            }
        } catch {
            error("操作失败");
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`确定要删除优惠券「${name}」吗？此操作不可恢复。`)) return;
        try {
            const res = await fetch(`/api/admin/coupons/${id}`, { method: "DELETE" });
            const data = await res.json();
            if (data.success) {
                success("删除成功");
                fetchCoupons(pagination.page);
            } else {
                error(data.error?.message || "删除失败");
            }
        } catch {
            error("删除失败");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight">优惠券管理</h1>
                <Link
                    href="/admin/coupons/create"
                    className="flex items-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90"
                >
                    <Plus className="h-4 w-4" />
                    创建优惠券
                </Link>
            </div>

            <div className="rounded-md border bg-white">
                <div className="relative w-full overflow-auto">
                    <table className="w-full caption-bottom text-sm text-left">
                        <thead className="[&_tr]:border-b">
                            <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">名称/代码</th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">类型/面值</th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">门槛</th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">有效期</th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">发放/总限</th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground">状态</th>
                                <th className="h-12 px-4 align-middle font-medium text-muted-foreground text-right">操作</th>
                            </tr>
                        </thead>
                        <tbody className="[&_tr:last-child]:border-0">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="p-4 text-center">加载中...</td>
                                </tr>
                            ) : coupons.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="p-4 text-center text-muted-foreground">暂无优惠券</td>
                                </tr>
                            ) : (
                                coupons.map((coupon) => (
                                    <tr key={coupon.id} className="border-b transition-colors hover:bg-muted/50">
                                        <td className="p-4 align-middle">
                                            <div className="font-medium">{coupon.name}</div>
                                            {coupon.code && (
                                                <div className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80 mt-1">
                                                    {coupon.code}
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-4 align-middle">
                                            <div>{coupon.type === "DISCOUNT_AMOUNT" ? "满减" : "折扣"}</div>
                                            <div className="font-bold text-lg">
                                                {coupon.type === "DISCOUNT_AMOUNT" ? `¥${coupon.value}` : `${Number(coupon.value) * 10}折`}
                                            </div>
                                        </td>
                                        <td className="p-4 align-middle">
                                            {Number(coupon.minAmount) > 0 ? `满 ¥${coupon.minAmount}` : "无门槛"}
                                        </td>
                                        <td className="p-4 align-middle">
                                            {coupon.daysValid ? (
                                                <span>领取后 {coupon.daysValid} 天有效</span>
                                            ) : (
                                                <span>
                                                    {coupon.startDate ? formatDate(coupon.startDate) : "即日起"}
                                                    至
                                                    {coupon.endDate ? formatDate(coupon.endDate) : "永久"}
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 align-middle">
                                            <div className="flex items-center gap-1">
                                                <Users className="w-4 h-4 text-gray-400" />
                                                {coupon._count.userCoupons} / {coupon.totalLimit === null ? "∞" : coupon.totalLimit}
                                            </div>
                                            <div className="text-xs text-gray-400 mt-0.5">
                                                已使用 {coupon.userCoupons.length} 张
                                            </div>
                                        </td>
                                        <td className="p-4 align-middle">
                                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${coupon.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                                                {coupon.isActive ? "进行中" : "下架"}
                                            </span>
                                        </td>
                                        <td className="p-4 align-middle text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => handleToggleActive(coupon.id, coupon.isActive)}
                                                    className={`p-1.5 rounded-md transition-colors ${coupon.isActive ? "hover:bg-red-50 text-red-600" : "hover:bg-green-50 text-green-600"}`}
                                                    title={coupon.isActive ? "下架" : "上架"}
                                                >
                                                    <Power className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(coupon.id, coupon.name)}
                                                    className="p-1.5 rounded-md hover:bg-red-50 text-red-600 transition-colors"
                                                    title="删除"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 分页 */}
            {pagination.totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                    <button
                        onClick={() => fetchCoupons(pagination.page - 1)}
                        disabled={pagination.page <= 1}
                        className="p-2 rounded-md border hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm text-gray-600">
                        第 {pagination.page} / {pagination.totalPages} 页，共 {pagination.total} 条
                    </span>
                    <button
                        onClick={() => fetchCoupons(pagination.page + 1)}
                        disabled={pagination.page >= pagination.totalPages}
                        className="p-2 rounded-md border hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    );
}
