"use client";

import { useEffect, useState } from "react";
import { Ticket, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { deferInEffect } from "@/hooks/deferInEffect";

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
  const { error: showError } = useToast();

  const fetchCoupons = async (status?: string) => {
    setLoading(true);
    try {
      const url =
        status && status !== "all" ? `/api/user/coupons?status=${status}` : "/api/user/coupons";
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setCoupons(data.data);
      }
    } catch {
      console.error("获取优惠券失败");
      showError("获取优惠券失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    deferInEffect(() => fetchCoupons());
  }, []);

  const handleFilterChange = (f: FilterStatus) => {
    setFilter(f);
    fetchCoupons(f);
  };

  const getStatusBadge = (uc: UserCoupon) => {
    if (uc.displayStatus === "USED") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
          <CheckCircle className="h-3 w-3" />
          已使用
        </span>
      );
    }
    if (uc.displayStatus === "EXPIRED" || uc.isExpired) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
          <XCircle className="h-3 w-3" />
          已过期
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
        <Clock className="h-3 w-3" />
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
      <div className="mb-6 flex items-center gap-3">
        <Ticket className="h-5 w-5 text-[#A69374]" strokeWidth={1.5} />
        <h2 className="text-lg font-medium text-[#00263E]">我的优惠券</h2>
      </div>

      {/* 筛选 */}
      <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {(
          [
            { key: "all", label: "全部" },
            { key: "UNUSED", label: "未使用" },
            { key: "USED", label: "已使用" },
            { key: "EXPIRED", label: "已过期" },
          ] as { key: FilterStatus; label: string }[]
        ).map((f) => (
          <button
            key={f.key}
            onClick={() => handleFilterChange(f.key)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === f.key
                ? "bg-[#A69374] text-white"
                : "bg-[#FBF8F0] text-[#4A6272] hover:bg-[#FBF8F0]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[#A69374]" />
        </div>
      ) : coupons.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[#4A6272]">
          <Ticket className="mb-3 h-10 w-10 opacity-30" strokeWidth={1.5} />
          <p className="text-sm">暂无优惠券</p>
        </div>
      ) : (
        <div className="space-y-3">
          {coupons.map((uc) => (
            <div
              key={uc.id}
              className={`relative rounded-xl border p-4 transition-all ${
                uc.displayStatus === "EXPIRED" || uc.isExpired
                  ? "border-gray-200 bg-gray-50/50 opacity-70"
                  : uc.displayStatus === "USED"
                    ? "border-green-100 bg-green-50/30"
                    : "border-[#E8E3DC] bg-white hover:border-[#A69374]/40"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="truncate font-medium text-[#00263E]">{uc.coupon.name}</span>
                    {uc.coupon.code && (
                      <span className="rounded bg-[#FBF8F0] px-1.5 py-0.5 font-mono text-[10px] text-[#4A6272]">
                        {uc.coupon.code}
                      </span>
                    )}
                  </div>
                  <div className="mb-2 flex items-baseline gap-2">
                    <span className="text-xl font-bold text-[#A69374]">
                      {getCouponValueText(uc)}
                    </span>
                    <span className="text-xs text-[#4A6272]">
                      {Number(uc.coupon.minAmount) > 0
                        ? `满 ¥${uc.coupon.minAmount} 可用`
                        : "无门槛"}
                    </span>
                  </div>
                  <div className="text-xs text-[#4A6272]">
                    {uc.displayStatus === "USED" && uc.usedAt
                      ? `使用时间：${new Date(uc.usedAt).toISOString().split("T")[0]}`
                      : `有效期至：${new Date(uc.expiresAt).toISOString().split("T")[0]}`}
                  </div>
                </div>
                <div className="ml-3 shrink-0">{getStatusBadge(uc)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
