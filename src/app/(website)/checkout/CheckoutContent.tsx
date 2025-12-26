"use client";

/**
 * 结算页面内容
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Address } from "@/generated/prisma/client";

interface CheckoutItem {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  price: number;
  quantity: number;
  image: string | null;
}

interface CheckoutContentProps {
  items: CheckoutItem[];
  addresses: Address[];
  totalPrice: number;
}

export default function CheckoutContent({ items, addresses, totalPrice }: CheckoutContentProps) {
  const router = useRouter();
  const [selectedAddressId, setSelectedAddressId] = useState(
    addresses.find((a) => a.isDefault)?.id || addresses[0]?.id || ""
  );
  const [remark, setRemark] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const _selectedAddress = addresses.find((a) => a.id === selectedAddressId);

  // 提交订单
  const handleSubmit = async () => {
    if (!selectedAddressId) {
      setError("请选择收货地址");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addressId: selectedAddressId,
          items: items.map((i) => ({
            productId: i.productId,
            variantId: i.variantId || undefined,
            quantity: i.quantity,
          })),
          remark: remark || undefined,
        }),
      });

      const data = await res.json();

      if (data.success) {
        // 跳转到支付页面
        router.push(`/pay/${data.data.orderId}`);
      } else {
        setError(data.error?.message || "提交失败");
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 pb-24">
      {/* 收货地址 */}
      <div className="bg-white rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-medium text-gray-900">收货地址</h2>
          <Link href="/user/addresses" className="text-sm text-pink-500">
            管理
          </Link>
        </div>

        {addresses.length === 0 ? (
          <Link href="/user/addresses/add" className="block text-center py-4 text-gray-500">
            + 添加收货地址
          </Link>
        ) : (
          <div className="space-y-2">
            {addresses.map((addr) => (
              <label
                key={addr.id}
                className={`block p-3 border rounded-lg cursor-pointer ${
                  selectedAddressId === addr.id ? "border-pink-500 bg-pink-50" : "border-gray-200"
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
                  <span className="font-medium">{addr.name}</span>
                  <span className="text-gray-500">{addr.phone}</span>
                  {addr.isDefault && (
                    <span className="text-xs bg-pink-100 text-pink-600 px-1 rounded">默认</span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {addr.province} {addr.city} {addr.district} {addr.detail}
                </p>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* 商品列表 */}
      <div className="bg-white rounded-xl p-4 mb-4">
        <h2 className="font-medium text-gray-900 mb-3">商品清单</h2>
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div key={idx} className="flex gap-3">
              <div className="w-16 h-16 bg-gray-100 rounded overflow-hidden flex-shrink-0">
                {item.image && (
                  <Image src={item.image} alt={item.productName} width={64} height={64} className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.productName}</p>
                {item.variantName && <p className="text-xs text-gray-500">{item.variantName}</p>}
                <div className="flex justify-between mt-1">
                  <span className="text-pink-500">¥{item.price.toFixed(2)}</span>
                  <span className="text-gray-500">x{item.quantity}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 备注 */}
      <div className="bg-white rounded-xl p-4 mb-4">
        <textarea
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          placeholder="订单备注（选填）"
          rows={2}
          maxLength={200}
          className="w-full border-none resize-none focus:ring-0 text-sm"
        />
      </div>

      {/* 错误提示 */}
      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {/* 底部提交栏 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t px-4 py-3 flex items-center">
        <div className="flex-1">
          <p className="text-sm text-gray-500">共 {items.length} 件商品</p>
          <p className="text-lg font-bold">
            合计：<span className="text-pink-500">¥{totalPrice.toFixed(2)}</span>
          </p>
        </div>
        <button
          onClick={handleSubmit}
          disabled={loading || !selectedAddressId}
          className="px-8 py-3 bg-pink-500 text-white rounded-full font-medium disabled:opacity-50"
        >
          {loading ? "提交中..." : "提交订单"}
        </button>
      </div>
    </div>
  );
}

