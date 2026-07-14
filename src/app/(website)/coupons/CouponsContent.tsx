"use client";

import { useEffect, useState, useCallback } from "react";
import { Ticket, Loader2, Check, Gift, Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { apiPost, ApiError } from "@/lib/api-client";

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
}

export function CouponsContent() {
  const toast = useToast();
  const { user, openLoginModal } = useAuth();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [acquiring, setAcquiring] = useState<string | null>(null);
  const [acquiredIds, setAcquiredIds] = useState<Set<string>>(new Set());

  const fetchCoupons = useCallback(async () => {
    setLoading(true);
    try {
      // 并行获取公开优惠券和用户已领列表
      const [publicRes, userRes] = await Promise.all([
        fetch("/api/coupons/public"),
        user ? fetch("/api/user/coupons") : Promise.resolve(null),
      ]);

      const publicData = await publicRes.json();
      if (publicData.success) {
        setCoupons(publicData.data.coupons);
      }

      // 交叉比对：将用户已领的优惠券模板ID标记为已领取
      if (userRes) {
        const userData = await userRes.json();
        if (userData.success && Array.isArray(userData.data)) {
          const ids = new Set<string>();
          for (const uc of userData.data) {
            if (uc.coupon?.id) ids.add(uc.coupon.id);
          }
          setAcquiredIds(ids);
        }
      }
    } catch {
      console.error("获取优惠券失败");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchCoupons();
  }, [fetchCoupons]);

  const handleAcquire = async (coupon: Coupon) => {
    if (!user) {
      openLoginModal();
      return;
    }
    if (acquiring) return;

    setAcquiring(coupon.id);
    try {
      await apiPost("/api/coupons/acquire", {
        couponId: coupon.id,
        ...(coupon.code && { code: coupon.code }),
      });
      setAcquiredIds((prev) => new Set(prev).add(coupon.id));
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message);
      } else {
        toast.error("领取失败，请重试");
      }
    } finally {
      setAcquiring(null);
    }
  };

  const getValueText = (coupon: Coupon) => {
    if (coupon.type === "DISCOUNT_AMOUNT") {
      return `¥${coupon.value}`;
    }
    return `${(coupon.value * 10).toFixed(1)}折`;
  };

  const getValidityText = (coupon: Coupon) => {
    if (coupon.daysValid) {
      return `领取后 ${coupon.daysValid} 天有效`;
    }
    if (coupon.endDate) {
      const end = new Date(coupon.endDate).toLocaleDateString("zh-CN");
      return `有效期至 ${end}`;
    }
    return "长期有效";
  };

  const isStarted = (coupon: Coupon) => {
    if (!coupon.startDate) return true;
    return new Date() >= new Date(coupon.startDate);
  };

  const isEnded = (coupon: Coupon) => {
    if (!coupon.endDate) return false;
    return new Date() > new Date(coupon.endDate);
  };

  return (
    <div className="min-h-dvh bg-[#FAF5EA] py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* 头部 */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#A69374]/10 mb-4">
            <Gift className="w-7 h-7 text-[#A69374]" />
          </div>
          <h1 className="text-2xl font-bold text-[#00263E] mb-2">领券中心</h1>
          <p className="text-sm text-[#4A6272]">领取优惠券，享受更多购物优惠</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-[#A69374] animate-spin" />
          </div>
        ) : coupons.length === 0 ? (
          <div className="text-center py-20 text-[#4A6272]">
            <Ticket className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>暂无可用优惠券</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {coupons.map((coupon) => {
              const started = isStarted(coupon);
              const ended = isEnded(coupon);
              const disabled = !started || ended || acquiredIds.has(coupon.id);

              return (
                <div
                  key={coupon.id}
                  className={`relative rounded-2xl border p-5 flex items-center gap-4 transition-all ${
                    disabled
                      ? "bg-gray-50 border-gray-200 opacity-60"
                      : "bg-white border-[#E8E3DC] hover:border-[#A69374]/40 hover:shadow-sm"
                  }`}
                >
                  {/* 左侧面值 */}
                  <div className="shrink-0 w-20 text-center">
                    <div className="text-2xl font-bold text-[#A69374]">{getValueText(coupon)}</div>
                    <div className="text-[10px] text-[#4A6272] mt-0.5">
                      {Number(coupon.minAmount) > 0 ? `满¥${coupon.minAmount}` : "无门槛"}
                    </div>
                  </div>

                  {/* 分隔线 */}
                  <div className="w-px h-14 bg-[#FAF5EA]" />

                  {/* 右侧信息 */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-[#00263E] text-sm mb-1 truncate">{coupon.name}</h3>
                    <div className="flex items-center gap-1 text-xs text-[#4A6272] mb-2">
                      <Clock className="w-3 h-3" />
                      {getValidityText(coupon)}
                    </div>
                    {!started && (
                      <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                        即将开始
                      </span>
                    )}
                    {ended && (
                      <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                        已结束
                      </span>
                    )}
                  </div>

                  {/* 领取按钮 */}
                  <button
                    onClick={() => handleAcquire(coupon)}
                    disabled={disabled}
                    className={`shrink-0 px-4 py-2 rounded-xl text-xs font-medium transition-colors ${
                      acquiredIds.has(coupon.id)
                        ? "bg-green-50 text-green-700 cursor-default"
                        : disabled
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : "bg-[#A69374] text-white hover:bg-[#4A6272]"
                    }`}
                  >
                    {acquiredIds.has(coupon.id) ? (
                      <span className="flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        已领取
                      </span>
                    ) : acquiring === coupon.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      "领取"
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
