/**
 * 支付结果页面
 */
import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "支付结果 - 你好朵朵",
};

interface PayResultPageProps {
  searchParams: Promise<{ orderId?: string; status?: string }>;
}

export default async function PayResultPage({ searchParams }: PayResultPageProps) {
  const params = await searchParams;
  const { orderId, status } = params;
  
  const isSuccess = status === "success";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      {/* 结果图标 */}
      <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 ${
        isSuccess ? "bg-green-100" : "bg-red-100"
      }`}>
        {isSuccess ? (
          <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
      </div>

      {/* 结果文案 */}
      <h1 className={`text-2xl font-bold mb-2 ${isSuccess ? "text-green-600" : "text-red-600"}`}>
        {isSuccess ? "支付成功" : "支付失败"}
      </h1>
      <p className="text-gray-500 mb-8">
        {isSuccess ? "感谢您的购买，我们将尽快为您发货" : "支付未完成，请重试"}
      </p>

      {/* 操作按钮 */}
      <div className="flex gap-4">
        {orderId && (
          <Link
            href={`/user/orders/${orderId}`}
            className="px-6 py-3 bg-pink-500 text-white rounded-xl font-medium"
          >
            查看订单
          </Link>
        )}
        <Link
          href="/"
          className="px-6 py-3 border border-gray-300 text-gray-600 rounded-xl font-medium"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}

