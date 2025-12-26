"use client";

import { useState, useEffect, useMemo } from "react";
import { MapPin, Edit3, Trash2, Loader2, Check, ChevronDown } from "lucide-react";
import cascaderOptions, { type CascaderOption } from "@pansy/china-division";

interface Address {
  id: string;
  name: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  isDefault: boolean;
}

export function AddressesPanel() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Address | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetchAddresses();
  }, []);

  const fetchAddresses = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/user/addresses");
      const data = await res.json();
      if (data.success) setAddresses(data.data.addresses || []);
    } catch (e) {
      console.error("获取地址失败:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除此地址？")) return;
    try {
      await fetch(`/api/user/addresses/${id}`, { method: "DELETE" });
      fetchAddresses();
    } catch (e) {
      console.error("删除失败:", e);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await fetch(`/api/user/addresses/${id}/default`, { method: "PUT" });
      fetchAddresses();
    } catch (e) {
      console.error("设置默认失败:", e);
    }
  };

  if (showForm || editing) {
    return <AddressForm address={editing} onClose={() => { setShowForm(false); setEditing(null); }} onSuccess={() => { setShowForm(false); setEditing(null); fetchAddresses(); }} />;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 p-6 pb-4">
        <h2 className="text-xl text-[#5C5347] font-light">收货地址</h2>
        <p className="text-[#A69B8C] text-sm mt-1">管理您的收货地址</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 pt-2">
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-[#A69374] animate-spin" /></div>
        ) : addresses.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto rounded-full bg-[#F5F2ED] flex items-center justify-center mb-4"><MapPin className="w-8 h-8 text-[#C4BDB2]" /></div>
            <p className="text-[#8B8579]">暂无收货地址</p>
            <button onClick={() => setShowForm(true)} className="mt-4 text-[#A69374] text-sm hover:underline">添加一个地址</button>
          </div>
        ) : (
          <div className="space-y-3">
            {addresses.map((addr) => (
              <div key={addr.id} className={`bg-white/80 rounded-xl p-4 border ${addr.isDefault ? "border-[#A69374]" : "border-[#E8E3DC]"}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[#5C5347] font-medium">{addr.name}</span>
                      <span className="text-[#8B8579]">{addr.phone}</span>
                      {addr.isDefault && <span className="px-2 py-0.5 bg-[#A69374]/10 text-[#A69374] text-xs rounded">默认</span>}
                    </div>
                    <p className="text-[#8B8579] text-sm">{addr.province}{addr.city}{addr.district}{addr.detail}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditing(addr)} className="p-2 text-[#8B8579] hover:text-[#5C5347] hover:bg-[#F5F2ED] rounded-lg transition-colors"><Edit3 className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(addr.id)} className="p-2 text-[#8B8579] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                {!addr.isDefault && (
                  <button onClick={() => handleSetDefault(addr.id)} className="mt-3 text-[#A69374] text-sm hover:underline">设为默认</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// 美化的地区选择器组件
function RegionSelect({ label, value, onChange, options, placeholder, disabled, required }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: CascaderOption[];
  placeholder: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasValue = !!value;

  return (
    <div>
      <label className="block text-[#8B8579] text-sm mb-1">{label}</label>
      <div className="relative">
        <button
          type="button"
          onClick={() => !disabled && setOpen(!open)}
          className={`w-full px-3 py-2 border rounded-lg text-left flex items-center justify-between transition-all ${
            disabled
              ? "bg-[#F5F2ED] border-[#E8E3DC] text-[#C4BDB2] cursor-not-allowed"
              : open
                ? "border-[#A69374] ring-2 ring-[#A69374]/20"
                : "border-[#E8E3DC] hover:border-[#C4BDB2] bg-white cursor-pointer"
          }`}
        >
          <span className={hasValue ? "text-[#5C5347]" : "text-[#C4BDB2]"}>
            {value || placeholder}
          </span>
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""} ${disabled ? "text-[#C4BDB2]" : "text-[#8B8579]"}`} />
        </button>
        {/* 隐藏的原生 select 用于表单验证 */}
        {required && <input type="text" value={value} required className="sr-only" onChange={() => {}} tabIndex={-1} />}
        {/* 下拉菜单 */}
        {open && !disabled && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-[#E8E3DC] rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {options.length === 0 ? (
                <div className="px-3 py-2 text-[#C4BDB2] text-sm">暂无数据</div>
              ) : (
                options.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { onChange(opt.label); setOpen(false); }}
                    className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                      opt.label === value
                        ? "bg-[#A69374]/10 text-[#A69374]"
                        : "text-[#5C5347] hover:bg-[#F5F2ED]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AddressForm({ address, onClose, onSuccess }: { address: Address | null; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ name: address?.name || "", phone: address?.phone || "", province: address?.province || "", city: address?.city || "", district: address?.district || "", detail: address?.detail || "", isDefault: address?.isDefault || false });
  const [saving, setSaving] = useState(false);

  // 省份列表（直接使用完整的级联数据）
  const provinces = cascaderOptions;

  // 根据选中的省份获取城市列表
  const cities = useMemo(() => {
    if (!form.province) return [];
    const province = provinces.find((p: CascaderOption) => p.label === form.province);
    return province?.children || [];
  }, [form.province, provinces]);

  // 根据选中的城市获取区县列表
  const districts = useMemo(() => {
    if (!form.city || !cities.length) return [];
    const city = cities.find((c: CascaderOption) => c.label === form.city);
    return city?.children || [];
  }, [form.city, cities]);

  // 省份变化时清空城市和区县
  const handleProvinceChange = (provinceName: string) => {
    setForm({ ...form, province: provinceName, city: "", district: "" });
  };

  // 城市变化时清空区县
  const handleCityChange = (cityName: string) => {
    setForm({ ...form, city: cityName, district: "" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = address ? `/api/user/addresses/${address.id}` : "/api/user/addresses";
      const method = address ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (res.ok) onSuccess();
    } catch (e) {
      console.error("保存失败:", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 p-6 pb-4 border-b border-[#E8E3DC]">
        <h2 className="text-xl text-[#5C5347] font-light">{address ? "编辑地址" : "新增地址"}</h2>
        <button onClick={onClose} className="mt-1 text-[#A69374] text-sm hover:underline flex items-center gap-1">
          ← 返回地址列表
        </button>
      </div>
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-[#8B8579] text-sm mb-1">收货人</label><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-[#E8E3DC] rounded-lg focus:border-[#A69374] outline-none" required /></div>
            <div><label className="block text-[#8B8579] text-sm mb-1">手机号</label><input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 border border-[#E8E3DC] rounded-lg focus:border-[#A69374] outline-none" required /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <RegionSelect label="省份" value={form.province} onChange={handleProvinceChange} options={provinces} placeholder="选择省份" required />
            <RegionSelect label="城市" value={form.city} onChange={handleCityChange} options={cities} placeholder="选择城市" disabled={!form.province} required />
            <RegionSelect label="区县" value={form.district} onChange={(v) => setForm({ ...form, district: v })} options={districts} placeholder="选择区县" disabled={!form.city} required />
          </div>
          <div><label className="block text-[#8B8579] text-sm mb-1">详细地址</label><textarea value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} className="w-full px-3 py-2 border border-[#E8E3DC] rounded-lg focus:border-[#A69374] outline-none resize-none" rows={3} required /></div>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} className="w-4 h-4 text-[#A69374] rounded" /><span className="text-[#5C5347] text-sm">设为默认地址</span></label>
        </div>
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-[#E8E3DC] text-[#5C5347] rounded-lg hover:bg-[#F5F2ED] transition-colors">取消</button>
          <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-[#A69374] text-white rounded-lg hover:bg-[#917F62] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}<span>保存</span></button>
        </div>
      </form>
    </div>
  );
}

