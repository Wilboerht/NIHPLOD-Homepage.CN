
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Users, Pencil, Trash2, Power, ChevronLeft, ChevronRight, X } from "lucide-react";
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
    userLimit: number;
    scopeType: string;
    scopeIds: string[];
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
    const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
    const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
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
        // 加载品类列表（用于编辑弹窗的适用范围选择）
        fetch("/api/admin/categories")
            .then((res) => res.json())
            .then((data) => {
                if (data.success) setCategories(data.data);
            })
            .catch(() => {});
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

    const handleEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingCoupon) return;

        try {
            const payload: Record<string, unknown> = {
                name: editingCoupon.name,
                type: editingCoupon.type,
                value: Number(editingCoupon.value),
                minAmount: Number(editingCoupon.minAmount),
                userLimit: Number(editingCoupon.userLimit),
                code: editingCoupon.code || null,
                totalLimit: editingCoupon.totalLimit !== null ? Number(editingCoupon.totalLimit) : null,
            };

            if (editingCoupon.daysValid) {
                payload.daysValid = Number(editingCoupon.daysValid);
                payload.startDate = null;
                payload.endDate = null;
            } else {
                payload.daysValid = null;
                if (editingCoupon.startDate) payload.startDate = new Date(editingCoupon.startDate).toISOString();
                if (editingCoupon.endDate) payload.endDate = new Date(editingCoupon.endDate).toISOString();
            }

            const res = await fetch(`/api/admin/coupons/${editingCoupon.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (data.success) {
                success("编辑成功");
                setEditingCoupon(null);
                fetchCoupons(pagination.page);
            } else {
                error(data.error?.message || "编辑失败");
            }
        } catch {
            error("编辑失败");
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
                                                    onClick={() => setEditingCoupon(coupon)}
                                                    className="p-1.5 rounded-md hover:bg-blue-50 text-blue-600 transition-colors"
                                                    title="编辑"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
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

            {/* 编辑弹窗 */}
            {editingCoupon && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-lg bg-white rounded-xl shadow-xl max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between p-5 border-b">
                            <h2 className="text-lg font-semibold">编辑优惠券</h2>
                            <button onClick={() => setEditingCoupon(null)} className="p-1 hover:bg-gray-100 rounded">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleEdit} className="p-5 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">名称</label>
                                    <input
                                        required
                                        className="w-full p-2 border rounded-md text-sm"
                                        value={editingCoupon.name}
                                        onChange={e => setEditingCoupon({ ...editingCoupon, name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">兑换码 (选填)</label>
                                    <input
                                        className="w-full p-2 border rounded-md text-sm"
                                        value={editingCoupon.code || ""}
                                        onChange={e => setEditingCoupon({ ...editingCoupon, code: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">类型</label>
                                    <select
                                        className="w-full p-2 border rounded-md text-sm"
                                        value={editingCoupon.type}
                                        onChange={e => setEditingCoupon({ ...editingCoupon, type: e.target.value })}
                                    >
                                        <option value="DISCOUNT_AMOUNT">金额立减</option>
                                        <option value="DISCOUNT_PERCENT">百分比折扣</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">
                                        {editingCoupon.type === "DISCOUNT_AMOUNT" ? "面值 (元)" : "折扣率 (0.9=9折)"}
                                    </label>
                                    <input
                                        required
                                        type="number"
                                        step="0.01"
                                        className="w-full p-2 border rounded-md text-sm"
                                        value={editingCoupon.value}
                                        onChange={e => setEditingCoupon({ ...editingCoupon, value: Number(e.target.value) })}
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">最低消费 (元)</label>
                                <input
                                    required
                                    type="number"
                                    className="w-full p-2 border rounded-md text-sm"
                                    value={editingCoupon.minAmount}
                                    onChange={e => setEditingCoupon({ ...editingCoupon, minAmount: Number(e.target.value) })}
                                />
                            </div>
                            <div className="space-y-3 border-t pt-4">
                                <label className="text-sm font-medium">有效期设置</label>
                                <div className="flex gap-4 text-sm">
                                    <label className="flex items-center gap-2">
                                        <input
                                            type="radio"
                                            checked={!editingCoupon.daysValid}
                                            onChange={() => setEditingCoupon({ ...editingCoupon, daysValid: null })}
                                        />
                                        固定日期范围
                                    </label>
                                    <label className="flex items-center gap-2">
                                        <input
                                            type="radio"
                                            checked={!!editingCoupon.daysValid}
                                            onChange={() => setEditingCoupon({ ...editingCoupon, daysValid: editingCoupon.daysValid || 30 })}
                                        />
                                        动态有效期 (领取后N天)
                                    </label>
                                </div>
                                {!editingCoupon.daysValid ? (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-xs text-gray-500">开始时间</label>
                                            <input
                                                type="datetime-local"
                                                className="w-full p-2 border rounded-md text-sm"
                                                value={editingCoupon.startDate ? new Date(editingCoupon.startDate).toISOString().slice(0, 16) : ""}
                                                onChange={e => setEditingCoupon({ ...editingCoupon, startDate: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs text-gray-500">结束时间</label>
                                            <input
                                                type="datetime-local"
                                                className="w-full p-2 border rounded-md text-sm"
                                                value={editingCoupon.endDate ? new Date(editingCoupon.endDate).toISOString().slice(0, 16) : ""}
                                                onChange={e => setEditingCoupon({ ...editingCoupon, endDate: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-1">
                                        <label className="text-xs text-gray-500">有效天数</label>
                                        <input
                                            type="number"
                                            className="w-full p-2 border rounded-md text-sm"
                                            value={editingCoupon.daysValid || ""}
                                            onChange={e => setEditingCoupon({ ...editingCoupon, daysValid: Number(e.target.value) })}
                                        />
                                    </div>
                                )}
                            </div>
                            <div className="space-y-3 border-t pt-4">
                                <label className="text-sm font-medium">适用范围</label>
                                <div className="flex gap-4 text-sm">
                                    <label className="flex items-center gap-2">
                                        <input
                                            type="radio"
                                            checked={editingCoupon.scopeType === 'ALL'}
                                            onChange={() => setEditingCoupon({ ...editingCoupon, scopeType: 'ALL', scopeIds: [] })}
                                        />
                                        全场通用
                                    </label>
                                    <label className="flex items-center gap-2">
                                        <input
                                            type="radio"
                                            checked={editingCoupon.scopeType === 'CATEGORY'}
                                            onChange={() => setEditingCoupon({ ...editingCoupon, scopeType: 'CATEGORY', scopeIds: [] })}
                                        />
                                        指定品类
                                    </label>
                                    <label className="flex items-center gap-2">
                                        <input
                                            type="radio"
                                            checked={editingCoupon.scopeType === 'PRODUCT'}
                                            onChange={() => setEditingCoupon({ ...editingCoupon, scopeType: 'PRODUCT', scopeIds: [] })}
                                        />
                                        指定商品
                                    </label>
                                </div>
                                {editingCoupon.scopeType === 'CATEGORY' && (
                                    <div className="space-y-2">
                                        <label className="text-xs text-gray-500">选择适用品类（可多选）</label>
                                        <div className="flex flex-wrap gap-2">
                                            {categories.map((cat) => (
                                                <label key={cat.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors ${editingCoupon.scopeIds.includes(cat.id) ? 'bg-black text-white border-black' : 'bg-white hover:bg-gray-50 border-gray-200'}`}>
                                                    <input
                                                        type="checkbox"
                                                        className="hidden"
                                                        checked={editingCoupon.scopeIds.includes(cat.id)}
                                                        onChange={(e) => {
                                                            const ids = new Set(editingCoupon.scopeIds);
                                                            if (e.target.checked) ids.add(cat.id);
                                                            else ids.delete(cat.id);
                                                            setEditingCoupon({ ...editingCoupon, scopeIds: Array.from(ids) });
                                                        }}
                                                    />
                                                    {cat.name}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {editingCoupon.scopeType === 'PRODUCT' && (
                                    <div className="space-y-2">
                                        <label className="text-xs text-gray-500">适用商品ID（逗号分隔）</label>
                                        <input
                                            className="w-full p-2 border rounded-md text-sm"
                                            placeholder="例如：abc123,def456"
                                            value={editingCoupon.scopeIds.join(",")}
                                            onChange={(e) => setEditingCoupon({ ...editingCoupon, scopeIds: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                                        />
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-4 border-t pt-4">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">总发行量</label>
                                    <input
                                        type="number"
                                        className="w-full p-2 border rounded-md text-sm"
                                        placeholder="留空为无限"
                                        value={editingCoupon.totalLimit !== null ? editingCoupon.totalLimit : ""}
                                        onChange={e => setEditingCoupon({ ...editingCoupon, totalLimit: e.target.value ? Number(e.target.value) : null })}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">每人限领</label>
                                    <input
                                        required
                                        type="number"
                                        className="w-full p-2 border rounded-md text-sm"
                                        value={editingCoupon.userLimit}
                                        onChange={e => setEditingCoupon({ ...editingCoupon, userLimit: Number(e.target.value) })}
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setEditingCoupon(null)}
                                    className="px-4 py-2 border rounded-md text-sm hover:bg-gray-50"
                                >
                                    取消
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-black text-white rounded-md text-sm hover:bg-black/90"
                                >
                                    保存
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
