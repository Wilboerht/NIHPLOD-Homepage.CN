
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";

export default function CreateCouponPage() {
    const router = useRouter();
    const { success, error } = useToast();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        code: "",
        type: "DISCOUNT_AMOUNT",
        value: "",
        minAmount: "0",
        validityType: "fixed", // fixed | dynamic
        startDate: "",
        endDate: "",
        daysValid: "",
        totalLimit: "",
        userLimit: "1",
        scopeType: "ALL" as "ALL" | "CATEGORY" | "PRODUCT",
        scopeIds: [] as string[],
    });
    const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

    useEffect(() => {
        // 加载品类列表（用于适用范围选择）
        fetch("/api/admin/categories")
            .then((res) => res.json())
            .then((data) => {
                if (data.success) setCategories(data.data);
            })
            .catch(() => {});
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const payload: Record<string, unknown> = {
                name: formData.name,
                type: formData.type,
                value: Number(formData.value),
                minAmount: Number(formData.minAmount),
                userLimit: Number(formData.userLimit),
                code: formData.code || undefined,
                totalLimit: formData.totalLimit ? Number(formData.totalLimit) : null,
                scopeType: formData.scopeType,
                scopeIds: formData.scopeType === "ALL" ? [] : formData.scopeIds,
            };

            if (formData.validityType === 'fixed') {
                if (formData.startDate) payload.startDate = new Date(formData.startDate).toISOString();
                if (formData.endDate) payload.endDate = new Date(formData.endDate).toISOString();
            } else {
                payload.daysValid = Number(formData.daysValid);
            }

            const res = await fetch("/api/admin/coupons", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const data = await res.json();
            if (data.success) {
                success("优惠券创建成功");
                router.push("/admin/coupons");
            } else {
                error(typeof data.error === "string" ? data.error : data.error?.message || "创建失败");
            }
        } catch {
            error("创建失败，请检查网络或稍后重试");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/admin/coupons" className="p-2 hover:bg-gray-100 rounded-full">
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <h1 className="text-2xl font-bold">创建优惠券</h1>
            </div>

            <div className="bg-white p-6 rounded-lg border shadow-sm">
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* 基本信息 */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">名称</label>
                            <input
                                required
                                className="w-full p-2 border rounded"
                                placeholder="例如：新人立减券"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">兑换码 (选填)</label>
                            <input
                                className="w-full p-2 border rounded"
                                placeholder="为空则需主动领取"
                                value={formData.code}
                                onChange={e => setFormData({ ...formData, code: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">类型</label>
                            <select
                                className="w-full p-2 border rounded"
                                value={formData.type}
                                onChange={e => setFormData({ ...formData, type: e.target.value })}
                            >
                                <option value="DISCOUNT_AMOUNT">金额立减</option>
                                <option value="DISCOUNT_PERCENT">百分比折扣</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">
                                {formData.type === 'DISCOUNT_AMOUNT' ? '面值 (元)' : '折扣率 (0.9=9折)'}
                            </label>
                            <input
                                required
                                type="number"
                                step="0.01"
                                className="w-full p-2 border rounded"
                                value={formData.value}
                                onChange={e => setFormData({ ...formData, value: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">最低消费 (元)</label>
                        <input
                            required
                            type="number"
                            className="w-full p-2 border rounded"
                            value={formData.minAmount}
                            onChange={e => setFormData({ ...formData, minAmount: e.target.value })}
                        />
                    </div>

                    {/* 有效期 */}
                    <div className="space-y-4 border-t pt-4">
                        <label className="text-sm font-medium">有效期设置</label>
                        <div className="flex gap-4">
                            <label className="flex items-center gap-2">
                                <input type="radio" checked={formData.validityType === 'fixed'} onChange={() => setFormData({ ...formData, validityType: 'fixed' })} />
                                固定日期范围
                            </label>
                            <label className="flex items-center gap-2">
                                <input type="radio" checked={formData.validityType === 'dynamic'} onChange={() => setFormData({ ...formData, validityType: 'dynamic' })} />
                                动态有效期 (领取后N天)
                            </label>
                        </div>

                        {formData.validityType === 'fixed' ? (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs text-gray-500">开始时间</label>
                                    <input type="datetime-local" className="w-full p-2 border rounded"
                                        value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs text-gray-500">结束时间</label>
                                    <input type="datetime-local" className="w-full p-2 border rounded"
                                        value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} />
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <label className="text-xs text-gray-500">有效天数</label>
                                <input type="number" className="w-full p-2 border rounded" placeholder="30"
                                    value={formData.daysValid} onChange={e => setFormData({ ...formData, daysValid: e.target.value })} />
                            </div>
                        )}
                    </div>

                    {/* 适用范围 */}
                    <div className="space-y-4 border-t pt-4">
                        <label className="text-sm font-medium">适用范围</label>
                        <div className="flex gap-4">
                            <label className="flex items-center gap-2 text-sm">
                                <input type="radio" checked={formData.scopeType === 'ALL'} onChange={() => setFormData({ ...formData, scopeType: 'ALL', scopeIds: [] })} />
                                全场通用
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                                <input type="radio" checked={formData.scopeType === 'CATEGORY'} onChange={() => setFormData({ ...formData, scopeType: 'CATEGORY', scopeIds: [] })} />
                                指定品类
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                                <input type="radio" checked={formData.scopeType === 'PRODUCT'} onChange={() => setFormData({ ...formData, scopeType: 'PRODUCT', scopeIds: [] })} />
                                指定商品
                            </label>
                        </div>

                        {formData.scopeType === 'CATEGORY' && (
                            <div className="space-y-2">
                                <label className="text-xs text-gray-500">选择适用品类（可多选）</label>
                                <div className="flex flex-wrap gap-2">
                                    {categories.map((cat) => (
                                        <label key={cat.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors ${formData.scopeIds.includes(cat.id) ? 'bg-black text-white border-black' : 'bg-white hover:bg-gray-50 border-gray-200'}`}>
                                            <input
                                                type="checkbox"
                                                className="hidden"
                                                checked={formData.scopeIds.includes(cat.id)}
                                                onChange={(e) => {
                                                    const ids = new Set(formData.scopeIds);
                                                    if (e.target.checked) ids.add(cat.id);
                                                    else ids.delete(cat.id);
                                                    setFormData({ ...formData, scopeIds: Array.from(ids) });
                                                }}
                                            />
                                            {cat.name}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        {formData.scopeType === 'PRODUCT' && (
                            <div className="space-y-2">
                                <label className="text-xs text-gray-500">适用商品ID（逗号分隔）</label>
                                <input
                                    className="w-full p-2 border rounded text-sm"
                                    placeholder="例如：abc123,def456"
                                    value={formData.scopeIds.join(",")}
                                    onChange={(e) => setFormData({ ...formData, scopeIds: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                                />
                            </div>
                        )}
                    </div>

                    {/* 发放限制 */}
                    <div className="grid grid-cols-2 gap-4 border-t pt-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">总发行量</label>
                            <input
                                type="number"
                                className="w-full p-2 border rounded"
                                placeholder="留空为无限"
                                value={formData.totalLimit}
                                onChange={e => setFormData({ ...formData, totalLimit: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">每人限领</label>
                            <input
                                required
                                type="number"
                                className="w-full p-2 border rounded"
                                value={formData.userLimit}
                                onChange={e => setFormData({ ...formData, userLimit: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="pt-4">
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-black text-white py-2 rounded hover:bg-black/90 disabled:opacity-50"
                        >
                            {loading ? "创建中..." : "创建优惠券"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
