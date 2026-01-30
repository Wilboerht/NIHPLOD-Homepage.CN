
"use client";

import { useEffect, useState, useCallback } from "react";
import { useToast } from "@/hooks/useToast";

type Coupon = {
    id: string;
    name: string;
    value: number;
    type: string;
    minAmount: number;
    startDate: string | null;
    endDate: string | null;
};

type UserCoupon = {
    id: string;
    status: string;
    expiresAt: string;
    coupon: Coupon;
    displayStatus: string;
};

export default function UserCouponsPage() {
    const [coupons, setCoupons] = useState<UserCoupon[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("UNUSED");
    const [code, setCode] = useState("");
    const { success, error } = useToast();

    const fetchCoupons = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/user/coupons?status=${activeTab === 'ALL' ? '' : activeTab}`);
            const data = await res.json();
            if (data.success) {
                setCoupons(data.data);
            }
        } finally {
            setLoading(false);
        }
    }, [activeTab]);

    useEffect(() => {
        fetchCoupons();
    }, [fetchCoupons]);

    const handleRedeem = async () => {
        if (!code) return;
        try {
            const res = await fetch("/api/coupons/acquire", {
                method: "POST",
                body: JSON.stringify({ code }),
            });
            const result = await res.json();
            if (result.success) {
                success("兑换成功！");
                setCode("");
                fetchCoupons();
            } else {
                error(result.error || "兑换失败");
            }
        } catch {
            error("兑换异常");
        }
    };

    return (
        <div className="max-w-4xl mx-auto px-4 py-8">
            <h1 className="text-2xl font-light text-[#5C5347] mb-6">我的优惠券</h1>

            {/* 兑换区域 */}
            <div className="bg-white p-6 rounded-xl shadow-sm mb-8 flex gap-4 items-center border border-[#E8E3DC]">
                <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="请输入优惠码兑换"
                    className="flex-1 border border-[#E8E3DC] px-4 py-2 rounded-lg font-mono text-[#5C5347] focus:outline-none focus:border-[#A69374] transition-colors"
                />
                <button
                    onClick={handleRedeem}
                    className="bg-[#A69374] text-white px-6 py-2 rounded-lg hover:bg-[#8C7A5E] transition-colors font-medium"
                >
                    兑换
                </button>
            </div>

            {/* 标签页 */}
            <div className="flex border-b border-[#E8E3DC] mb-6">
                {["UNUSED", "USED", "EXPIRED"].map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === tab
                            ? "border-[#A69374] text-[#A69374]"
                            : "border-transparent text-[#8B8579] hover:text-[#5C5347]"
                            }`}
                    >
                        {tab === "UNUSED" ? "未使用" : tab === "USED" ? "已使用" : "已过期"}
                    </button>
                ))}
            </div>

            {/* 列表 */}
            {loading ? (
                <div className="py-10 text-center text-[#A69B8C]">加载中...</div>
            ) : coupons.length === 0 ? (
                <div className="py-20 text-center bg-gray-50 rounded-xl border border-dashed border-[#C4BDB2]">
                    <p className="text-[#8B8579]">暂无相关优惠券</p>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2">
                    {coupons.map((uc) => (
                        <div
                            key={uc.id}
                            className={`relative border rounded-xl overflow-hidden flex bg-white
                ${uc.displayStatus !== "UNUSED" ? "opacity-60 grayscale" : "border-[#E8E3DC] shadow-sm hover:shadow-md transition-shadow"}
              `}
                        >
                            {/* 左侧金额 */}
                            <div className="w-32 bg-[#A69374] flex flex-col items-center justify-center text-white p-4">
                                <div className="text-2xl font-bold">
                                    {uc.coupon.type === 'DISCOUNT_AMOUNT' ? `¥${uc.coupon.value}` : `${Number(uc.coupon.value) * 10}折`}
                                </div>
                                <div className="text-xs mt-1 opacity-80">
                                    满 {Number(uc.coupon.minAmount)} 可用
                                </div>
                            </div>

                            {/* 右侧信息 */}
                            <div className="flex-1 p-4 flex flex-col justify-between">
                                <div>
                                    <h3 className="font-medium text-[#5C5347]">{uc.coupon.name}</h3>
                                    <p className="text-xs text-[#8B8579] mt-2">有效期至 {new Date(uc.expiresAt).toLocaleDateString()}</p>
                                </div>
                                <div className="flex justify-end mt-2">
                                    <span className={`text-xs px-2 py-0.5 rounded border 
                    ${uc.displayStatus === 'UNUSED' ? "text-[#A69374] border-[#A69374]" : "text-gray-400 border-gray-300"}`}>
                                        {uc.displayStatus === "UNUSED" ? "去使用" : uc.displayStatus}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
