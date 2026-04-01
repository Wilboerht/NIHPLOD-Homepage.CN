"use client";

/**
 * 支付模态框组件
 */
import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, m } from "framer-motion";
import { X, CreditCard, Loader2, Clock, Check, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

// 纹理背景 - 与 CheckoutModal 保持一致的透明度
const TEXTURE_BG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E")`;

type PayMethod = "wechat" | "alipay";

interface OrderData {
  id: string;
  orderNo: string;
  payAmount: number;
  createdAt: string;
}

export default function PayModal() {
  const _router = useRouter();
  const { payOpen, payOrderId, closePay, openUserCenter } = useAuth();

  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState<OrderData | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [payMethod, setPayMethod] = useState<PayMethod>("wechat");

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadOrder = useCallback(async () => {
    if (!payOrderId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/orders/${payOrderId}`);
      const data = await res.json();
      if (data.success) {
        // API 返回的是 data.data.order
        setOrder(data.data.order);
      } else {
        setError(data.error?.message || "加载订单失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }, [payOrderId]);

  useEffect(() => {
    if (payOpen && payOrderId) {
      // 重置状态
      setOrder(null);
      setError("");
      setCountdown(0);
      loadOrder();
    }
  }, [payOpen, payOrderId, loadOrder]);

  useEffect(() => {
    if (!order) return;
    const createdAt = new Date(order.createdAt).getTime();
    const expireAt = createdAt + 30 * 60 * 1000;

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.floor((expireAt - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining === 0) setError("订单已超时，请重新下单");
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [order]);

  const formatCountdown = () => {
    const m = Math.floor(countdown / 60);
    const s = countdown % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handlePay = async () => {
    if (!order) return;
    setSubmitting(true);
    setError("");

    try {
      const isWechatBrowser = /MicroMessenger/i.test(navigator.userAgent);
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );

      const payload: {
        orderId: string;
        payMethod: PayMethod;
        tradeType?: "JSAPI" | "MWEB" | "NATIVE";
      } = {
        orderId: order.id,
        payMethod,
      };

      if (payMethod === "wechat") {
        payload.tradeType = isWechatBrowser ? "JSAPI" : isMobile ? "MWEB" : "NATIVE";
      }

      const res = await fetch("/api/pay/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error?.message || "支付失败");
        return;
      }

      if (data.data.payType === "mock") {
        if (confirm("开发环境：模拟支付成功？")) {
          await fetch("/api/pay/mock-success", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: order.id }),
          });
          closePay();
          // 支付成功后打开用户中心订单详情
          openUserCenter("orders", order.id);
        }
        return;
      }

      if (data.data.payType === "alipay") {
        window.location.href = data.data.payUrl;
        return;
      }

      if (data.data.payParams && typeof WeixinJSBridge !== "undefined") {
        WeixinJSBridge.invoke("getBrandWCPayRequest", data.data.payParams, (r: { err_msg: string }) => {
          if (r.err_msg === "get_brand_wcpay_request:ok") {
            closePay();
            // 支付成功后打开用户中心订单详情
            openUserCenter("orders", order.id);
          } else if (r.err_msg === "get_brand_wcpay_request:cancel") {
            setError("支付已取消");
          } else {
            setError("支付失败");
          }
        });
      } else {
        if (data.data.mwebUrl) {
          window.location.href = data.data.mwebUrl;
          return;
        }

        if (data.data.codeUrl) {
          setError("请使用微信扫码支付（当前设备不支持微信内直接唤起）");
          return;
        }

        setError("请在微信中打开支付");
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLater = () => {
    closePay();
    openUserCenter("orders");
  };

  if (!mounted) return null;

  const content = (
    <AnimatePresence>
      {payOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          {/* 遮罩 - 支付流程中不允许点击遮罩关闭 */}
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <m.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-sm bg-[#FAF8F5] rounded-2xl shadow-2xl overflow-hidden"
            style={{ backgroundImage: TEXTURE_BG }}
          >
            <button
              onClick={closePay}
              className="absolute top-4 right-4 z-10 p-2 rounded-full text-[#8B8579] hover:text-[#5C5347] hover:bg-[#E8E3DC] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="px-6 pt-6 pb-4 border-b border-[#E8E3DC]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#A69374]/10 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-[#A69374]" />
                </div>
                <div>
                  <h2 className="text-lg font-medium text-[#5C5347]">订单支付</h2>
                  <p className="text-xs text-[#A69B8C]">请选择支付方式完成付款</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="w-8 h-8 text-[#A69374] animate-spin" />
                  <p className="text-sm text-[#A69B8C]">加载中...</p>
                </div>
              ) : error && !order ? (
                <div className="text-center py-12">
                  <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
                  <p className="text-red-500 mb-4">{error}</p>
                  <button onClick={loadOrder} className="text-[#A69374] hover:underline">重试</button>
                </div>
              ) : order ? (
                <>
                  <div className="text-center mb-6">
                    <p className="text-sm text-[#A69B8C] mb-2">支付金额</p>
                    <p className="text-4xl font-bold text-[#A69374]">¥{Number(order.payAmount).toFixed(2)}</p>
                    <p className="text-xs text-[#A69B8C] mt-2">订单号：{order.orderNo}</p>
                  </div>
                  {countdown > 0 && (
                    <div className="flex items-center justify-center gap-2 text-sm text-orange-500 mb-4 bg-orange-50 py-2 rounded-lg">
                      <Clock className="w-4 h-4" />请在 {formatCountdown()} 内完成支付
                    </div>
                  )}
                  <div className="space-y-2 mb-6">
                    <button
                      onClick={() => setPayMethod("wechat")}
                      className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${payMethod === "wechat" ? "border-green-500 bg-green-50" : "border-[#E8E3DC] bg-white/60"}`}
                    >
                      <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348z" /></svg>
                      </div>
                      <span className="font-medium text-[#5C5347]">微信支付</span>
                      {payMethod === "wechat" && <Check className="w-5 h-5 text-green-500 ml-auto" />}
                    </button>
                    <button
                      onClick={() => setPayMethod("alipay")}
                      className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${payMethod === "alipay" ? "border-blue-500 bg-blue-50" : "border-[#E8E3DC] bg-white/60"}`}
                    >
                      <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M21.422 15.358c-.538-.186-3.071-1.071-4.857-1.714.257-.514.457-1.043.614-1.586h-3.464v-1.072h4.286v-.714h-4.286V9.2h4.286c.078 0 .143-.043.143-.129V8.2c0-.086-.065-.129-.143-.129h-4.286v-.857c0-.086-.057-.143-.143-.143h-1.143c-.086 0-.143.057-.143.143v.857H8.002c-.086 0-.143.043-.143.129v.871c0 .086.057.129.143.129h4.284v1.072H8.002c-.086 0-.143.043-.143.129v.857c0 .086.057.129.143.129h4.284v1.072h-3.25l-.036.107c-.321.929-.75 1.786-1.286 2.536-1.036-.393-2.143-.75-3.143-1.036-.786-.214-1.607.214-1.857.929-.25.75.179 1.571.929 1.821 1.643.536 3.357 1.143 4.929 1.786-.857.643-1.857 1.143-2.929 1.5-.75.25-1.143 1.071-.893 1.821.25.75 1.071 1.143 1.821.893 2.179-.714 4.071-1.929 5.536-3.536 2.25.964 4.179 1.857 4.393 1.929.75.25 1.571-.179 1.821-.929.25-.75-.179-1.571-.929-1.821z" /></svg>
                      </div>
                      <span className="font-medium text-[#5C5347]">支付宝</span>
                      {payMethod === "alipay" && <Check className="w-5 h-5 text-blue-500 ml-auto" />}
                    </button>

                  </div>
                  {error && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl border border-red-100 mb-4">{error}</div>}
                  <button
                    onClick={handlePay}
                    disabled={submitting || countdown === 0}
                    className={`w-full py-3.5 text-white rounded-xl font-medium disabled:opacity-50 flex items-center justify-center gap-2 transition-colors ${payMethod === "wechat"
                        ? "bg-green-500 hover:bg-green-600"
                        : payMethod === "alipay"
                          ? "bg-blue-500 hover:bg-blue-600"
                          : "bg-[#004A94] hover:bg-[#003d7a]"
                      }`}
                  >
                    {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />处理中...</> : "立即支付"}
                  </button>
                  <button onClick={handleLater} className="w-full mt-3 py-2 text-[#A69B8C] text-sm hover:text-[#5C5347]">暂不支付，稍后处理</button>
                </>
              ) : null}
            </div>
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}

// 微信 JSAPI 类型声明
declare global {
  interface Window {
    WeixinJSBridge?: {
      invoke: (api: string, params: unknown, callback: (res: { err_msg: string }) => void) => void;
    };
  }
  const WeixinJSBridge: Window["WeixinJSBridge"];
}

