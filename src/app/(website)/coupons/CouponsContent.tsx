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
  const { user, redirectToLogin } = useAuth();
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
      redirectToLogin();
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
    <div className="min-h-dvh bg-[#FBF8F0] px-4 py-12">
      <div className="mx-auto max-w-4xl">
        {/* 头部 */}
        <div className="mb-10 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#A69374]/10">
            <Gift className="h-7 w-7 text-[#A69374]" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-[#00263E]">领券中心</h1>
          <p className="text-sm text-[#4A6272]">领取优惠券，享受更多购物优惠</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-[#A69374]" />
          </div>
        ) : coupons.length === 0 ? (
          <div className="py-20 text-center text-[#4A6272]">
            <Ticket className="mx-auto mb-3 h-12 w-12 opacity-30" />
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
                  className={`relative flex items-center gap-4 rounded-2xl border p-5 transition-all ${
                    disabled
                      ? "border-gray-200 bg-gray-50 opacity-60"
                      : "border-[#E8E3DC] bg-white hover:border-[#A69374]/40 hover:shadow-sm"
                  }`}
                >
                  {/* 左侧面值 */}
                  <div className="w-20 shrink-0 text-center">
                    <div className="text-2xl font-bold text-[#A69374]">{getValueText(coupon)}</div>
                    <div className="mt-0.5 text-[10px] text-[#4A6272]">
                      {Number(coupon.minAmount) > 0 ? `满¥${coupon.minAmount}` : "无门槛"}
                    </div>
                  </div>

                  {/* 分隔线 */}
                  <div className="h-14 w-px bg-[#FBF8F0]" />

                  {/* 右侧信息 */}
                  <div className="min-w-0 flex-1">
                    <h3 className="mb-1 truncate text-sm font-medium text-[#00263E]">
                      {coupon.name}
                    </h3>
                    <div className="mb-2 flex items-center gap-1 text-xs text-[#4A6272]">
                      <Clock className="h-3 w-3" />
                      {getValidityText(coupon)}
                    </div>
                    {!started && (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-600">
                        即将开始
                      </span>
                    )}
                    {ended && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                        已结束
                      </span>
                    )}
                  </div>

                  {/* 领取按钮 */}
                  <button
                    onClick={() => handleAcquire(coupon)}
                    disabled={disabled}
                    className={`shrink-0 rounded-xl px-4 py-2 text-xs font-medium transition-colors ${
                      acquiredIds.has(coupon.id)
                        ? "cursor-default bg-green-50 text-green-700"
                        : disabled
                          ? "cursor-not-allowed bg-gray-100 text-gray-400"
                          : "bg-[#A69374] text-white hover:bg-[#4A6272]"
                    }`}
                  >
                    {acquiredIds.has(coupon.id) ? (
                      <span className="flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        已领取
                      </span>
                    ) : acquiring === coupon.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
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
