"use client";

/**
 * 结算模态框组件
 * 自然纹理风格 - 与 UserCenterModal 风格一致
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { m, AnimatePresence } from "framer-motion";
import { X, MapPin, ChevronRight, ShoppingBag, FileText, Loader2, Check } from "lucide-react";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";

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

interface CheckoutData {
  items: CheckoutItem[];
  addresses: AddressData[];
  totalPrice: number;
}

// 自然纹理背景样式
const TEXTURE_BG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E")`;

export function CheckoutModal() {
  const { user, checkoutOpen, closeCheckout, openUserCenter, openLoginModal, openPay } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<CheckoutData | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState("");
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
  useEffect(() => {
    if (checkoutOpen && user) {
      loadCheckoutData();
    }
  }, [checkoutOpen, user]);

  const loadCheckoutData = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/checkout/data");
      const result = await res.json();
      if (result.success) {
        setData(result.data);
        // 设置默认地址
        const defaultAddr = result.data.addresses.find((a: AddressData) => a.isDefault);
        setSelectedAddressId(defaultAddr?.id || result.data.addresses[0]?.id || "");
      } else {
        setError(result.error?.message || "加载失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  };

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
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addressId: selectedAddressId,
          items: data.items.map((i) => ({
            productId: i.productId,
            variantId: i.variantId || undefined,
            quantity: i.quantity,
          })),
          remark: remark || undefined,
        }),
      });

      const result = await res.json();

      if (result.success) {
        closeCheckout();
        // 直接打开支付模态框，而不是跳转页面
        openPay(result.data.orderId);
      } else {
        setError(result.error?.message || "提交失败");
      }
    } catch {
      setError("网络错误，请重试");
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
            className="relative w-full max-w-md max-h-[85vh] bg-[#FAF8F5] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            style={{ backgroundImage: TEXTURE_BG }}
          >
            {/* 关闭按钮 */}
            <button
              onClick={closeCheckout}
              className="absolute top-4 right-4 z-10 p-2 rounded-full text-[#8B8579] hover:text-[#5C5347] hover:bg-[#E8E3DC] transition-colors"
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
                                : "bg-[#F5F2ED] border-2 border-transparent hover:border-[#D4CFC6]"
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
                      <span className="text-xs text-[#A69B8C] bg-[#E8E3DC] px-2 py-0.5 rounded-full">
                        {data.items.length} 件
                      </span>
                    </div>
                    <div className="space-y-3 max-h-52 overflow-y-auto pr-1 scrollbar-thin">
                      {data.items.map((item, idx) => (
                        <div key={idx} className="flex gap-3 p-2 rounded-lg bg-[#F5F2ED]/50">
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
                                ¥{item.price.toFixed(2)}
                              </span>
                              <span className="text-xs text-[#A69B8C] bg-[#E8E3DC] px-2 py-0.5 rounded">
                                x{item.quantity}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

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
                      className="w-full bg-[#F5F2ED] border-none rounded-lg resize-none focus:ring-2 focus:ring-[#A69374]/30 text-sm text-[#5C5347] placeholder:text-[#A69B8C] p-3"
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
            {data && (
              <div className="border-t border-[#E8E3DC] bg-white/80 px-6 py-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-[#A69B8C]">
                    共 {data.items.reduce((sum, i) => sum + i.quantity, 0)} 件商品
                  </span>
                  <div className="text-right">
                    <span className="text-sm text-[#8B8579]">合计：</span>
                    <span className="text-xl font-bold text-[#A69374]">
                      ¥{data.totalPrice.toFixed(2)}
                    </span>
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
            )}
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}

