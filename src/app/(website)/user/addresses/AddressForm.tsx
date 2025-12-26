"use client";

/**
 * 地址表单组件
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Address } from "@/generated/prisma/client";

interface AddressFormProps {
  address?: Address;
}

export default function AddressForm({ address }: AddressFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: address?.name || "",
    phone: address?.phone || "",
    province: address?.province || "",
    city: address?.city || "",
    district: address?.district || "",
    detail: address?.detail || "",
    isDefault: address?.isDefault || false,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const url = address 
        ? `/api/user/addresses/${address.id}` 
        : "/api/user/addresses";
      
      const res = await fetch(url, {
        method: address ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (data.success) {
        router.push("/user/addresses");
        router.refresh();
      } else {
        setError(data.error?.message || "保存失败");
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-6 space-y-4">
      {error && (
        <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>
      )}

      {/* 收货人 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">收货人</label>
        <input
          type="text"
          name="name"
          value={form.name}
          onChange={handleChange}
          placeholder="请输入收货人姓名"
          required
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
        />
      </div>

      {/* 手机号 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">手机号</label>
        <input
          type="tel"
          name="phone"
          value={form.phone}
          onChange={handleChange}
          placeholder="请输入手机号"
          required
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
        />
      </div>

      {/* 省市区 */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">省份</label>
          <input
            type="text"
            name="province"
            value={form.province}
            onChange={handleChange}
            placeholder="省份"
            required
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">城市</label>
          <input
            type="text"
            name="city"
            value={form.city}
            onChange={handleChange}
            placeholder="城市"
            required
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">区县</label>
          <input
            type="text"
            name="district"
            value={form.district}
            onChange={handleChange}
            placeholder="区县"
            required
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* 详细地址 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">详细地址</label>
        <textarea
          name="detail"
          value={form.detail}
          onChange={handleChange}
          placeholder="请输入详细地址，如街道、门牌号等"
          required
          rows={3}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-none"
        />
      </div>

      {/* 设为默认 */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          name="isDefault"
          checked={form.isDefault}
          onChange={handleChange}
          className="w-5 h-5 text-pink-500 rounded focus:ring-pink-500"
        />
        <span className="text-sm text-gray-700">设为默认地址</span>
      </label>

      {/* 提交按钮 */}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-pink-500 text-white rounded-lg font-medium disabled:opacity-50 hover:bg-pink-600 transition-colors"
      >
        {loading ? "保存中..." : "保存"}
      </button>
    </form>
  );
}

