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

export default function PayContent({ order }: PayContentProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);

  // 计算剩余支付时间（30分钟）
  useEffect(() => {
    const createdAt = new Date(order.createdAt).getTime();
    const expireAt = createdAt + 30 * 60 * 1000;
    
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.floor((expireAt - Date.now()) / 1000));
      setCountdown(remaining);
      
      if (remaining === 0) {
        // 超时，刷新页面
        router.refresh();
      }
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [order.createdAt, router]);

  // 格式化倒计时
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
        body: JSON.stringify({ orderId: order.id }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error?.message || "支付失败");
        return;
      }

      if (data.data.payType === "mock") {
        // 开发环境模拟支付
        if (confirm("开发环境：模拟支付成功？")) {
          // 模拟回调
          await fetch("/api/pay/mock-success", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: order.id }),
          });
          router.push(`/pay/result?orderId=${order.id}&status=success`);
        }
        return;
      }

      // 调用微信支付
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
      <div className="text-center mb-8">
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
        <p className="text-sm text-orange-500 mb-6">
          请在 {formatCountdown()} 内完成支付
        </p>
      )}

      {/* 错误提示 */}
      {error && (
        <p className="text-red-500 text-sm mb-4">{error}</p>
      )}

      {/* 支付按钮 */}
      <button
        onClick={handlePay}
        disabled={loading || countdown === 0}
        className="w-full max-w-xs py-4 bg-green-500 text-white rounded-xl font-medium text-lg disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348z"/>
        </svg>
        {loading ? "处理中..." : "微信支付"}
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

