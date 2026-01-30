
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Users } from "lucide-react";

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
}

export default function AdminCouponsPage() {
    const [coupons, setCoupons] = useState<Coupon[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/admin/coupons")
            .then((res) => res.json())
            .then((data) => {
                if (data.success) {
                    setCoupons(data.data);
                }
            })
            .finally(() => setLoading(false));
    }, []);

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
                            </tr>
                        </thead>
                        <tbody className="[&_tr:last-child]:border-0">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="p-4 text-center">加载中...</td>
                                </tr>
                            ) : coupons.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-4 text-center text-muted-foreground">暂无优惠券</td>
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
                                        </td>
                                        <td className="p-4 align-middle">
                                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${coupon.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                                                {coupon.isActive ? "进行中" : "下架"}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
