"use client";

/**
 * 结算模态框组件
 * 自然纹理风格 - 与 UserCenterModal 风格一致
 */
import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { m, AnimatePresence } from "framer-motion";
import { X, MapPin, ChevronRight, ShoppingBag, FileText, Loader2, Check } from "lucide-react";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
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
  const { user, checkoutOpen, checkoutSelectedProductIds, checkoutQuantities, closeCheckout, openUserCenter, openLoginModal, openPay } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<CheckoutData | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [selectedCouponId, setSelectedCouponId] = useState("");
  const [remark, setRemark] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  // 禁止背景滚动
  useEffect(() => {
    if (checkoutOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [checkoutOpen]);

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
      loadCheckoutData();
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
        source: checkoutSelectedProductIds && checkoutSelectedProductIds.length > 0 ? "direct_buy" : "cart",
      });

      closeCheckout();
      // 直接打开支付模态框，而不是跳转页面
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

  if (!mounted) return null;

  // 未登录时打开登录弹窗
  if (checkoutOpen && !user) {
    openLoginModal();
    closeCheckout();
    return null;
  }

  const _selectedAddress = data?.addresses.find((a) => a.id === selectedAddressId);

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
            className="relative w-full max-w-md max-h-[85vh] bg-[#F8F7F3] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            style={{ backgroundImage: TEXTURE_BG }}
          >
            {/* 关闭按钮 */}
            <button
              onClick={closeCheckout}
              className="absolute top-4 right-4 z-10 p-2 rounded-full text-[#8B8579] hover:text-[#5C5347] hover:bg-[#F8F7F3] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* 头部 */}
            <div className="px-6 pt-6 pb-4 border-b border-[#E8E3DC]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#A69374]/10 flex items-center justify-center">
                  <ShoppingBag className="w-5 h-5 text-[#A69374]" />
                </div>
                <div>
                  <h2 className="text-lg font-medium text-[#5C5347]">确认订单</h2>
                  <p className="text-xs text-[#A69B8C]">请确认您的订单信息</p>
                </div>
              </div>
            </div>

            {/* 内容区域 */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 className="w-8 h-8 text-[#A69374] animate-spin" />
                  <p className="text-sm text-[#A69B8C]">加载中...</p>
                </div>
              ) : error && !data ? (
                <div className="text-center py-16">
                  <p className="text-red-500 mb-4">{error}</p>
                  <button
                    onClick={loadCheckoutData}
                    className="text-[#A69374] hover:underline"
                  >
                    重试
                  </button>
                </div>
              ) : data ? (
                <>
                  {/* 收货地址 */}
                  <div className="bg-white/60 rounded-xl p-4 border border-[#E8E3DC]">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 text-[#5C5347] font-medium">
                        <MapPin className="w-4 h-4 text-[#A69374]" />
                        收货地址
                      </div>
                      <button
                        onClick={() => {
                          closeCheckout();
                          openUserCenter("addresses");
                        }}
                        className="text-sm text-[#A69374] flex items-center gap-1 hover:text-[#8B7355] transition-colors"
                      >
                        管理 <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    {data.addresses.length === 0 ? (
                      <button
                        onClick={() => {
                          closeCheckout();
                          openUserCenter("addresses");
                        }}
                        className="w-full py-4 border-2 border-dashed border-[#D4CFC6] rounded-xl text-[#A69B8C] hover:border-[#A69374] hover:text-[#A69374] transition-colors"
                      >
                        + 添加收货地址
                      </button>
                    ) : (
                      <div className="space-y-2">
                        {data.addresses.slice(0, 3).map((addr) => (
                          <label
                            key={addr.id}
                            className={`block p-3 rounded-xl cursor-pointer transition-all ${
                              selectedAddressId === addr.id
                                ? "bg-[#A69374]/10 border-2 border-[#A69374]"
                                : "bg-[#F8F7F3] border-2 border-transparent hover:border-[#D4CFC6]"
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
                                <Check className="w-4 h-4 text-[#A69374]" />
                              )}
                              <span className="font-medium text-[#5C5347]">{addr.name}</span>
                              <span className="text-[#A69B8C]">{addr.phone}</span>
                              {addr.isDefault && (
                                <span className="text-xs bg-[#A69374]/20 text-[#A69374] px-1.5 py-0.5 rounded">
                                  默认
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-[#8B8579] mt-1 pl-6">
                              {addr.province} {addr.city} {addr.district} {addr.detail}
                            </p>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 商品列表 */}
                  <div className="bg-white/60 rounded-xl p-4 border border-[#E8E3DC]">
                    <div className="flex items-center gap-2 mb-3">
                      <ShoppingBag className="w-4 h-4 text-[#A69374]" />
                      <h3 className="font-medium text-[#5C5347]">
                        商品清单
                      </h3>
                      <span className="text-xs text-[#A69B8C] bg-[#F8F7F3] px-2 py-0.5 rounded-full">
                        {data.items.length} 件
                      </span>
                    </div>
                    <div className="space-y-3 max-h-52 overflow-y-auto pr-1 scrollbar-thin">
                      {data.items.map((item, idx) => (
                        <div key={idx} className="flex gap-3 p-2 rounded-lg bg-[#F8F7F3]/50">
                          <div className="w-14 h-14 bg-white rounded-lg overflow-hidden flex-shrink-0 border border-[#E8E3DC]">
                            {item.image ? (
                              <Image
                                src={item.image}
                                alt={item.productName}
                                width={56}
                                height={56}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <ShoppingBag className="w-6 h-6 text-[#D4CFC6]" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[#5C5347] truncate">
                              {item.productName}
                            </p>
                            {item.variantName && (
                              <p className="text-xs text-[#A69B8C]">{item.variantName}</p>
                            )}
                            <div className="flex justify-between items-center mt-1">
                              <span className="text-sm text-[#A69374] font-medium">
                                {formatPrice(item.price)}
                              </span>
                              <span className="text-xs text-[#A69B8C] bg-[#F8F7F3] px-2 py-0.5 rounded">
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
                    <div className="bg-white/60 rounded-xl p-4 border border-[#E8E3DC]">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-medium text-[#5C5347]">优惠券</span>
                      </div>
                      <select
                        value={selectedCouponId}
                        onChange={(e) => setSelectedCouponId(e.target.value)}
                        className="w-full bg-[#F8F7F3] border-none rounded-lg text-sm text-[#5C5347] p-3 focus:ring-2 focus:ring-[#A69374]/30"
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
                  <div className="bg-white/60 rounded-xl p-4 border border-[#E8E3DC]">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="w-4 h-4 text-[#A69374]" />
                      <span className="text-sm font-medium text-[#5C5347]">订单备注</span>
                    </div>
                    <textarea
                      value={remark}
                      onChange={(e) => setRemark(e.target.value)}
                      placeholder="有什么想告诉我们的？（选填）"
                      rows={2}
                      maxLength={200}
                      className="w-full bg-[#F8F7F3] border-none rounded-lg resize-none focus:ring-2 focus:ring-[#A69374]/30 text-sm text-[#5C5347] placeholder:text-[#A69B8C] p-3"
                    />
                  </div>

                  {/* 错误提示 */}
                  {error && (
                    <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl border border-red-100">
                      {error}
                    </div>
                  )}
                </>
              ) : null}
            </div>

            {/* 底部提交栏 */}
            {data && (() => {
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
                  <div className="space-y-1 mb-3 text-sm">
                    <div className="flex justify-between text-[#8B8579]">
                      <span>商品小计</span>
                      <span>{formatPrice(data.totalPrice)}</span>
                    </div>
                    <div className="flex justify-between text-[#8B8579]">
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
                    <div className="flex justify-between items-center pt-2 border-t border-[#E8E3DC]">
                      <span className="text-sm text-[#A69B8C]">
                        共 {data.items.reduce((sum, i) => sum + i.quantity, 0)} 件商品
                      </span>
                      <div className="text-right">
                        <span className="text-sm text-[#8B8579]">合计：</span>
                        <span className="text-xl font-bold text-[#A69374]">
                          {formatPrice(finalTotal)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !selectedAddressId}
                    className="w-full py-3.5 bg-[#A69374] text-white rounded-xl font-medium disabled:opacity-50 hover:bg-[#8B7355] transition-colors flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
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

