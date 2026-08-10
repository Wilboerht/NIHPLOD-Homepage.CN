"use client";

/**
 * 结算模态框组件
 * 自然纹理风格 - 与 UserCenterModal 风格一致
 */
import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useMounted } from "@/hooks/useMounted";
import { deferInEffect } from "@/hooks/deferInEffect";
import { m, AnimatePresence } from "framer-motion";
import { X, MapPin, ChevronRight, ShoppingBag, FileText, Loader2, Check } from "lucide-react";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import { useScrollLock } from "@/hooks/useScrollLock";
import { formatPrice } from "@/lib/utils";
import { apiPost, ApiError } from "@/lib/api-client";

interface CheckoutItem {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  price: number;
  quantity: number;
  image: string | null;
}

interface AddressData {
  id: string;
  name: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  isDefault: boolean;
}

interface CouponData {
  id: string;
  name: string;
  type: string;
  value: number;
  minAmount: number;
  expiresAt: string;
}

interface CheckoutData {
  items: CheckoutItem[];
  addresses: AddressData[];
  totalPrice: number;
  shippingFee: number;
  finalTotal: number;
  availableCoupons: CouponData[];
}

// 自然纹理背景样式
const TEXTURE_BG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E")`;

export function CheckoutModal() {
  const {
    user,
    checkoutOpen,
    checkoutSelectedProductIds,
    checkoutQuantities,
    closeCheckout,
    openUserCenter,
    redirectToLogin,
    setPendingCheckout,
    openPay,
  } = useAuth();
  const mounted = useMounted();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<CheckoutData | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [selectedCouponId, setSelectedCouponId] = useState("");
  const [remark, setRemark] = useState("");

  useScrollLock(checkoutOpen);

  // ESC 关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCheckout();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [closeCheckout]);

  // 加载结算数据
  const loadCheckoutData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // 直接购买模式：传 productIds + quantities；购物车模式：不传参
      let url = "/api/checkout/data";
      if (checkoutSelectedProductIds && checkoutSelectedProductIds.length > 0) {
        url += `?productIds=${checkoutSelectedProductIds.join(",")}`;
        if (checkoutQuantities) {
          const qtyList = checkoutSelectedProductIds.map((id) => checkoutQuantities[id] || 1);
          url += `&quantities=${qtyList.join(",")}`;
        }
      }
      const res = await fetch(url);
      const result = await res.json();
      if (result.success) {
        const nextData = result.data as CheckoutData;

        if (nextData.items.length === 0) {
          setError("没有可结算的商品，请返回购物车重新选择");
          setData(null);
          return;
        }

        setData(nextData);
        setSelectedCouponId("");
        // 设置默认地址
        const defaultAddr = nextData.addresses.find((a: AddressData) => a.isDefault);
        setSelectedAddressId(defaultAddr?.id || nextData.addresses[0]?.id || "");
      } else {
        setError(result.error?.message || "加载失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }, [checkoutSelectedProductIds, checkoutQuantities]);

  useEffect(() => {
    if (checkoutOpen && user) {
      deferInEffect(loadCheckoutData);
    }
  }, [checkoutOpen, user, loadCheckoutData]);

  // 提交订单
  const handleSubmit = async () => {
    if (!selectedAddressId) {
      setError("请选择收货地址");
      return;
    }
    if (!data) return;

    setSubmitting(true);
    setError("");

    try {
      const result = await apiPost<{ orderId: string }>("/api/orders", {
        addressId: selectedAddressId,
        items: data.items.map((i) => ({
          productId: i.productId,
          variantId: i.variantId || undefined,
          quantity: i.quantity,
        })),
        remark: remark || undefined,
        userCouponId: selectedCouponId || undefined,
        source:
          checkoutSelectedProductIds && checkoutSelectedProductIds.length > 0
            ? "direct_buy"
            : "cart",
      });

      closeCheckout();
      openPay(result.orderId);
    } catch (error) {
      if (error instanceof ApiError) {
        setError(error.message);
      } else {
        setError("网络错误，请重试");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // 未登录时打开登录弹窗 — 必须放在 return null 之前，遵循 hooks 顺序规则
  useEffect(() => {
    if (checkoutOpen && !user) {
      setPendingCheckout({
        selectedProductIds: checkoutSelectedProductIds ?? undefined,
        quantities: checkoutQuantities ?? undefined,
      });
      redirectToLogin();
      closeCheckout();
    }
  }, [
    checkoutOpen,
    user,
    redirectToLogin,
    closeCheckout,
    checkoutSelectedProductIds,
    checkoutQuantities,
    setPendingCheckout,
  ]);

  if (!mounted) return null;

  const content = (
    <AnimatePresence>
      {checkoutOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* 遮罩 - 支付流程中不允许点击遮罩关闭 */}
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />

          {/* 弹窗主体 */}
          <m.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            role="dialog"
            aria-modal="true"
            aria-label="确认订单"
            className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-[#FBF8F0] shadow-2xl"
            style={{ backgroundImage: TEXTURE_BG }}
          >
            {/* 关闭按钮 */}
            <button
              onClick={closeCheckout}
              aria-label="关闭结算弹窗"
              className="absolute right-4 z-10 rounded-full p-2 text-[#4A6272] transition-colors hover:bg-[#FBF8F0] hover:text-[#00263E]"
              style={{ top: `calc(1rem + env(safe-area-inset-top, 0px))` }}
            >
              <X className="h-5 w-5" />
            </button>

            {/* 头部 */}
            <div className="border-b border-[#E8E3DC] px-6 pb-4 pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#A69374]/10">
                  <ShoppingBag className="h-5 w-5 text-[#A69374]" />
                </div>
                <div>
                  <h2 className="text-lg font-medium text-[#00263E]">确认订单</h2>
                  <p className="text-xs text-[#4A6272]">请确认您的订单信息</p>
                </div>
              </div>
            </div>

            {/* 内容区域 */}
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {loading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-[#A69374]" />
                  <p className="text-sm text-[#4A6272]">加载中...</p>
                </div>
              ) : error && !data ? (
                <div className="py-16 text-center">
                  <p className="mb-4 text-red-500">{error}</p>
                  <button onClick={loadCheckoutData} className="text-[#A69374] hover:underline">
                    重试
                  </button>
                </div>
              ) : data ? (
                <>
                  {/* 收货地址 */}
                  <div className="rounded-xl border border-[#E8E3DC] bg-white/60 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 font-medium text-[#00263E]">
                        <MapPin className="h-4 w-4 text-[#A69374]" />
                        收货地址
                      </div>
                      <button
                        onClick={() => {
                          closeCheckout();
                          openUserCenter("addresses");
                        }}
                        className="flex items-center gap-1 text-sm text-[#A69374] transition-colors hover:text-[#4A6272]"
                      >
                        管理 <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>

                    {data.addresses.length === 0 ? (
                      <button
                        onClick={() => {
                          closeCheckout();
                          openUserCenter("addresses");
                        }}
                        className="w-full rounded-xl border-2 border-dashed border-[#E4DFD9] py-4 text-[#4A6272] transition-colors hover:border-[#A69374] hover:text-[#A69374]"
                      >
                        + 添加收货地址
                      </button>
                    ) : (
                      <div className="space-y-2">
                        {data.addresses.slice(0, 3).map((addr) => (
                          <label
                            key={addr.id}
                            className={`block cursor-pointer rounded-xl p-3 transition-all ${
                              selectedAddressId === addr.id
                                ? "border-2 border-[#A69374] bg-[#A69374]/10"
                                : "border-2 border-transparent bg-[#FBF8F0] hover:border-[#E4DFD9]"
                            }`}
                          >
                            <input
                              type="radio"
                              name="address"
                              value={addr.id}
                              checked={selectedAddressId === addr.id}
                              onChange={() => setSelectedAddressId(addr.id)}
                              className="hidden"
                            />
                            <div className="flex items-center gap-2">
                              {selectedAddressId === addr.id && (
                                <Check className="h-4 w-4 text-[#A69374]" />
                              )}
                              <span className="font-medium text-[#00263E]">{addr.name}</span>
                              <span className="text-[#4A6272]">{addr.phone}</span>
                              {addr.isDefault && (
                                <span className="rounded bg-[#A69374]/20 px-1.5 py-0.5 text-xs text-[#A69374]">
                                  默认
                                </span>
                              )}
                            </div>
                            <p className="mt-1 pl-6 text-sm text-[#4A6272]">
                              {addr.province} {addr.city} {addr.district} {addr.detail}
                            </p>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 商品列表 */}
                  <div className="rounded-xl border border-[#E8E3DC] bg-white/60 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <ShoppingBag className="h-4 w-4 text-[#A69374]" />
                      <h3 className="font-medium text-[#00263E]">商品清单</h3>
                      <span className="rounded-full bg-[#FBF8F0] px-2 py-0.5 text-xs text-[#4A6272]">
                        {data.items.length} 件
                      </span>
                    </div>
                    <div className="scrollbar-thin max-h-52 space-y-3 overflow-y-auto pr-1">
                      {data.items.map((item, idx) => (
                        <div key={idx} className="flex gap-3 rounded-lg bg-[#FBF8F0]/50 p-2">
                          <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg border border-[#E8E3DC] bg-white">
                            {item.image ? (
                              <Image
                                src={item.image}
                                alt={item.productName}
                                width={56}
                                height={56}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                <ShoppingBag className="h-6 w-6 text-[#E4DFD9]" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-[#00263E]">
                              {item.productName}
                            </p>
                            {item.variantName && (
                              <p className="text-xs text-[#4A6272]">{item.variantName}</p>
                            )}
                            <div className="mt-1 flex items-center justify-between">
                              <span className="text-sm font-medium text-[#A69374]">
                                {formatPrice(item.price)}
                              </span>
                              <span className="rounded bg-[#FBF8F0] px-2 py-0.5 text-xs text-[#4A6272]">
                                x{item.quantity}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 优惠券 */}
                  {data.availableCoupons.length > 0 && (
                    <div className="rounded-xl border border-[#E8E3DC] bg-white/60 p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-sm font-medium text-[#00263E]">优惠券</span>
                      </div>
                      <select
                        value={selectedCouponId}
                        onChange={(e) => setSelectedCouponId(e.target.value)}
                        className="w-full rounded-lg border-none bg-[#FBF8F0] p-3 text-sm text-[#00263E] focus:ring-2 focus:ring-[#A69374]/30"
                      >
                        <option value="">不使用优惠券</option>
                        {data.availableCoupons.map((coupon) => (
                          <option key={coupon.id} value={coupon.id}>
                            {coupon.name}
                            {coupon.type === "DISCOUNT_AMOUNT"
                              ? ` (满${coupon.minAmount}减${coupon.value}元)`
                              : ` (满${coupon.minAmount}打${(coupon.value * 10).toFixed(1)}折)`}
                            {" — "}
                            有效期至{new Date(coupon.expiresAt).toLocaleDateString("zh-CN")}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* 备注 */}
                  <div className="rounded-xl border border-[#E8E3DC] bg-white/60 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-[#A69374]" />
                      <span className="text-sm font-medium text-[#00263E]">订单备注</span>
                    </div>
                    <textarea
                      value={remark}
                      onChange={(e) => setRemark(e.target.value)}
                      placeholder="有什么想告诉我们的？（选填）"
                      rows={2}
                      maxLength={200}
                      className="w-full resize-none rounded-lg border-none bg-[#FBF8F0] p-3 text-sm text-[#00263E] placeholder:text-[#4A6272] focus:ring-2 focus:ring-[#A69374]/30"
                    />
                  </div>

                  {/* 错误提示 */}
                  {error && (
                    <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                      {error}
                    </div>
                  )}
                </>
              ) : null}
            </div>

            {/* 底部提交栏 */}
            {data &&
              (() => {
                const selectedCoupon = data.availableCoupons.find((c) => c.id === selectedCouponId);
                let discountAmount = 0;
                if (selectedCoupon) {
                  if (selectedCoupon.type === "DISCOUNT_AMOUNT") {
                    discountAmount = Math.min(selectedCoupon.value, data.totalPrice);
                  } else if (selectedCoupon.type === "DISCOUNT_PERCENT") {
                    discountAmount = data.totalPrice * (1 - selectedCoupon.value);
                  }
                }
                const finalTotal = Math.max(0, data.totalPrice + data.shippingFee - discountAmount);

                return (
                  <div className="border-t border-[#E8E3DC] bg-white/80 px-6 py-4">
                    {/* 价格明细 */}
                    <div className="mb-3 space-y-1 text-sm">
                      <div className="flex justify-between text-[#4A6272]">
                        <span>商品小计</span>
                        <span>{formatPrice(data.totalPrice)}</span>
                      </div>
                      <div className="flex justify-between text-[#4A6272]">
                        <span>运费</span>
                        {data.shippingFee === 0 ? (
                          <span className="text-green-600">包邮</span>
                        ) : (
                          <span>{formatPrice(data.shippingFee)}</span>
                        )}
                      </div>
                      {discountAmount > 0 && (
                        <div className="flex justify-between text-green-600">
                          <span>优惠券优惠</span>
                          <span>-{formatPrice(discountAmount)}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between border-t border-[#E8E3DC] pt-2">
                        <span className="text-sm text-[#4A6272]">
                          共 {data.items.reduce((sum, i) => sum + i.quantity, 0)} 件商品
                        </span>
                        <div className="text-right">
                          <span className="text-sm text-[#4A6272]">合计：</span>
                          <span className="text-xl font-bold text-[#A69374]">
                            {formatPrice(finalTotal)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleSubmit}
                      disabled={submitting || !selectedAddressId}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#A69374] py-3.5 font-medium text-white transition-colors hover:bg-[#4A6272] disabled:opacity-50"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          提交中...
                        </>
                      ) : (
                        "提交订单"
                      )}
                    </button>
                  </div>
                );
              })()}
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}
