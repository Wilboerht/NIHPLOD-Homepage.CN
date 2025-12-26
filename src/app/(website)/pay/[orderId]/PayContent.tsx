"use client";

/**
 * 支付页面内容
 */
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Order } from "@/generated/prisma/client";

interface PayContentProps {
  order: Order;
}

type PayMethod = "wechat" | "alipay";

export default function PayContent({ order }: PayContentProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [payMethod, setPayMethod] = useState<PayMethod>("wechat");

  // 计算剩余支付时间（30分钟）
  useEffect(() => {
    const createdAt = new Date(order.createdAt).getTime();
    const expireAt = createdAt + 30 * 60 * 1000;

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.floor((expireAt - Date.now()) / 1000));
      setCountdown(remaining);

      if (remaining === 0) {
        router.refresh();
      }
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [order.createdAt, router]);

  const formatCountdown = () => {
    const minutes = Math.floor(countdown / 60);
    const seconds = countdown % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  // 发起支付
  const handlePay = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/pay/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, payMethod }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error?.message || "支付失败");
        return;
      }

      // 开发环境模拟支付
      if (data.data.payType === "mock") {
        if (confirm("开发环境：模拟支付成功？")) {
          await fetch("/api/pay/mock-success", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: order.id }),
          });
          router.push(`/pay/result?orderId=${order.id}&status=success`);
        }
        return;
      }

      // 支付宝支付 - 跳转到支付页面
      if (data.data.payType === "alipay") {
        window.location.href = data.data.payUrl;
        return;
      }

      // 微信支付
      if (typeof WeixinJSBridge !== "undefined") {
        WeixinJSBridge.invoke("getBrandWCPayRequest", data.data.payParams, (res: { err_msg: string }) => {
          if (res.err_msg === "get_brand_wcpay_request:ok") {
            router.push(`/pay/result?orderId=${order.id}&status=success`);
          } else if (res.err_msg === "get_brand_wcpay_request:cancel") {
            setError("支付已取消");
          } else {
            setError("支付失败");
          }
        });
      } else {
        setError("请在微信中打开支付");
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      {/* 支付金额 */}
      <div className="text-center mb-6">
        <p className="text-gray-500 mb-2">支付金额</p>
        <p className="text-4xl font-bold text-pink-500">
          ¥{Number(order.payAmount).toFixed(2)}
        </p>
        <p className="text-sm text-gray-400 mt-2">
          订单号：{order.orderNo}
        </p>
      </div>

      {/* 倒计时 */}
      {countdown > 0 && (
        <p className="text-sm text-orange-500 mb-4">
          请在 {formatCountdown()} 内完成支付
        </p>
      )}

      {/* 支付方式选择 */}
      <div className="w-full max-w-xs mb-6">
        <p className="text-sm text-gray-500 mb-3 text-center">选择支付方式</p>
        <div className="space-y-2">
          {/* 微信支付 */}
          <button
            onClick={() => setPayMethod("wechat")}
            className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-colors ${
              payMethod === "wechat" ? "border-green-500 bg-green-50" : "border-gray-200"
            }`}
          >
            <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348z"/>
              </svg>
            </div>
            <span className="font-medium">微信支付</span>
            {payMethod === "wechat" && (
              <svg className="w-5 h-5 text-green-500 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>

          {/* 支付宝 */}
          <button
            onClick={() => setPayMethod("alipay")}
            className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-colors ${
              payMethod === "alipay" ? "border-blue-500 bg-blue-50" : "border-gray-200"
            }`}
          >
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21.422 15.358c-.538-.186-3.071-1.071-4.857-1.714.257-.514.457-1.043.614-1.586h-3.464v-1.072h4.286v-.714h-4.286V9.2h4.286c.078 0 .143-.043.143-.129V8.2c0-.086-.065-.129-.143-.129h-4.286v-.857c0-.086-.057-.143-.143-.143h-1.143c-.086 0-.143.057-.143.143v.857H8.002c-.086 0-.143.043-.143.129v.871c0 .086.057.129.143.129h4.284v1.072H8.002c-.086 0-.143.043-.143.129v.857c0 .086.057.129.143.129h4.284v1.072h-3.25l-.036.107c-.321.929-.75 1.786-1.286 2.536-1.036-.393-2.143-.75-3.143-1.036-.786-.214-1.607.214-1.857.929-.25.75.179 1.571.929 1.821 1.643.536 3.357 1.143 4.929 1.786-.857.643-1.857 1.143-2.929 1.5-.75.25-1.143 1.071-.893 1.821.25.75 1.071 1.143 1.821.893 2.179-.714 4.071-1.929 5.536-3.536 2.25.964 4.179 1.857 4.393 1.929.75.25 1.571-.179 1.821-.929.25-.75-.179-1.571-.929-1.821z"/>
              </svg>
            </div>
            <span className="font-medium">支付宝</span>
            {payMethod === "alipay" && (
              <svg className="w-5 h-5 text-blue-500 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <p className="text-red-500 text-sm mb-4">{error}</p>
      )}

      {/* 支付按钮 */}
      <button
        onClick={handlePay}
        disabled={loading || countdown === 0}
        className={`w-full max-w-xs py-4 text-white rounded-xl font-medium text-lg disabled:opacity-50 flex items-center justify-center gap-2 ${
          payMethod === "wechat" ? "bg-green-500" : "bg-blue-500"
        }`}
      >
        {loading ? "处理中..." : "立即支付"}
      </button>

      {/* 取消链接 */}
      <button
        onClick={() => router.push("/user/orders")}
        className="mt-4 text-gray-500 text-sm hover:underline"
      >
        暂不支付
      </button>
    </div>
  );
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

