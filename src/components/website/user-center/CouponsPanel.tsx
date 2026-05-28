"use client";

import { useEffect, useState } from "react";
import { Ticket, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";

interface UserCoupon {
  id: string;
  status: string;
  displayStatus: string;
  isExpired: boolean;
  acquiredAt: string;
  expiresAt: string;
  usedAt: string | null;
  coupon: {
    name: string;
    type: string;
    value: number;
    minAmount: number;
    code: string | null;
  };
}

type FilterStatus = "all" | "UNUSED" | "USED" | "EXPIRED";

export function CouponsPanel() {
  const [coupons, setCoupons] = useState<UserCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>("all");

  useEffect(() => {
    fetchCoupons();
  }, []);

  const fetchCoupons = async (status?: string) => {
    setLoading(true);
    try {
      const url = status && status !== "all" ? `/api/user/coupons?status=${status}` : "/api/user/coupons";
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setCoupons(data.data);
      }
    } catch {
      console.error("获取优惠券失败");
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (f: FilterStatus) => {
    setFilter(f);
    fetchCoupons(f);
  };

  const getStatusBadge = (uc: UserCoupon) => {
    if (uc.displayStatus === "USED") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
          <CheckCircle className="w-3 h-3" />
          已使用
        </span>
      );
    }
    if (uc.displayStatus === "EXPIRED" || uc.isExpired) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
          <XCircle className="w-3 h-3" />
          已过期
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
        <Clock className="w-3 h-3" />
        未使用
      </span>
    );
  };

  const getCouponValueText = (uc: UserCoupon) => {
    if (uc.coupon.type === "DISCOUNT_AMOUNT") {
      return `¥${uc.coupon.value}`;
    }
    return `${(uc.coupon.value * 10).toFixed(1)}折`;
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-6 md:px-10 md:py-8">
      <div className="flex items-center gap-3 mb-6">
        <Ticket className="w-5 h-5 text-[#A69374]" strokeWidth={1.5} />
        <h2 className="text-lg font-medium text-[#5C5347]">我的优惠券</h2>
      </div>

      {/* 筛选 */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {([
          { key: "all", label: "全部" },
          { key: "UNUSED", label: "未使用" },
          { key: "USED", label: "已使用" },
          { key: "EXPIRED", label: "已过期" },
        ] as { key: FilterStatus; label: string }[]).map((f) => (
          <button
            key={f.key}
            onClick={() => handleFilterChange(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              filter === f.key
                ? "bg-[#A69374] text-white"
                : "bg-[#F8F7F3] text-[#8B8579] hover:bg-[#F8F7F3]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-[#A69374] animate-spin" />
        </div>
      ) : coupons.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[#A69B8C]">
          <Ticket className="w-10 h-10 mb-3 opacity-30" strokeWidth={1.5} />
          <p className="text-sm">暂无优惠券</p>
        </div>
      ) : (
        <div className="space-y-3">
          {coupons.map((uc) => (
            <div
              key={uc.id}
              className={`relative rounded-xl border p-4 transition-all ${
                uc.displayStatus === "EXPIRED" || uc.isExpired
                  ? "bg-gray-50/50 border-gray-200 opacity-70"
                  : uc.displayStatus === "USED"
                  ? "bg-green-50/30 border-green-100"
                  : "bg-white border-[#E8E3DC] hover:border-[#A69374]/40"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-[#5C5347] truncate">
                      {uc.coupon.name}
                    </span>
                    {uc.coupon.code && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F8F7F3] text-[#8B8579] font-mono">
                        {uc.coupon.code}
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-xl font-bold text-[#A69374]">
                      {getCouponValueText(uc)}
                    </span>
                    <span className="text-xs text-[#A69B8C]">
                      {Number(uc.coupon.minAmount) > 0
                        ? `满 ¥${uc.coupon.minAmount} 可用`
                        : "无门槛"}
                    </span>
                  </div>
                  <div className="text-xs text-[#A69B8C]">
                    {uc.displayStatus === "USED" && uc.usedAt
                      ? `使用时间：${new Date(uc.usedAt).toLocaleDateString("zh-CN")}`
                      : `有效期至：${new Date(uc.expiresAt).toLocaleDateString("zh-CN")}`}
                  </div>
                </div>
                <div className="shrink-0 ml-3">
                  {getStatusBadge(uc)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
