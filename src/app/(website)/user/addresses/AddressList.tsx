"use client";

/**
 * 地址列表组件
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Address } from "@/generated/prisma/client";

interface AddressListProps {
  initialAddresses: Address[];
}

export default function AddressList({ initialAddresses }: AddressListProps) {
  const router = useRouter();
  const [addresses, setAddresses] = useState(initialAddresses);
  const [loading, setLoading] = useState<string | null>(null);

  // 设为默认地址
  const setDefault = async (id: string) => {
    setLoading(id);
    try {
      const res = await fetch(`/api/user/addresses/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });

      if (res.ok) {
        setAddresses(prev => prev.map(addr => ({
          ...addr,
          isDefault: addr.id === id,
        })));
      }
    } catch (e) {
      console.error("设置默认地址失败:", e);
    }
    setLoading(null);
  };

  // 删除地址
  const deleteAddress = async (id: string) => {
    if (!confirm("确定删除此地址？")) return;

    setLoading(id);
    try {
      const res = await fetch(`/api/user/addresses/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setAddresses(prev => prev.filter(addr => addr.id !== id));
        router.refresh();
      }
    } catch (e) {
      console.error("删除地址失败:", e);
    }
    setLoading(null);
  };

  return (
    <div className="space-y-4">
      {addresses.map((address) => (
        <div 
          key={address.id}
          className="bg-white rounded-xl shadow-sm p-4"
        >
          {/* 地址头部 */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900">{address.name}</span>
              <span className="text-gray-500">{address.phone}</span>
              {address.isDefault && (
                <span className="px-2 py-0.5 bg-pink-100 text-pink-600 text-xs rounded">默认</span>
              )}
            </div>
          </div>

          {/* 地址详情 */}
          <p className="text-gray-600 text-sm">
            {address.province} {address.city} {address.district} {address.detail}
          </p>

          {/* 操作按钮 */}
          <div className="flex items-center justify-end gap-4 mt-4 pt-4 border-t border-gray-100">
            {!address.isDefault && (
              <button
                onClick={() => setDefault(address.id)}
                disabled={loading === address.id}
                className="text-sm text-gray-500 hover:text-pink-500 disabled:opacity-50"
              >
                设为默认
              </button>
            )}
            <a
              href={`/user/addresses/${address.id}/edit`}
              className="text-sm text-gray-500 hover:text-pink-500"
            >
              编辑
            </a>
            <button
              onClick={() => deleteAddress(address.id)}
              disabled={loading === address.id}
              className="text-sm text-gray-500 hover:text-red-500 disabled:opacity-50"
            >
              删除
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

