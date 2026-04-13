"use client";

import { useState, useEffect, useMemo } from "react";
import { MapPin, Edit3, Trash2, Loader2, Check, ChevronDown, Plus, ArrowLeft } from "lucide-react";
import cascaderOptions, { type CascaderOption } from "@pansy/china-division";
import { m, AnimatePresence } from "framer-motion";
import { useToast } from "@/components/ui/Toast";

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
  const { success: showSuccess, error: showError } = useToast();

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
      const res = await fetch(`/api/user/addresses/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        throw new Error(data?.error?.message || "删除地址失败");
      }

      showSuccess("地址已删除");
      fetchAddresses();
    } catch (e) {
      console.error("删除失败:", e);
      const message = e instanceof Error ? e.message : "删除失败，请稍后重试";
      showError(message);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const res = await fetch(`/api/user/addresses/${id}/default`, { method: "PUT" });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        throw new Error(data?.error?.message || "设置默认地址失败");
      }

      showSuccess("已设为默认地址");
      fetchAddresses();
    } catch (e) {
      console.error("设置默认失败:", e);
      const message = e instanceof Error ? e.message : "设置默认地址失败，请稍后重试";
      showError(message);
    }
  };

  if (showForm || editing) {
    return (
      <AddressForm
        address={editing}
        onClose={() => { setShowForm(false); setEditing(null); }}
        onSuccess={() => { setShowForm(false); setEditing(null); fetchAddresses(); }}
      />
    );
  }

  return (
    <div className="h-full flex flex-col pt-4 md:pt-10">
      <div className="hidden md:flex px-16 pb-6 shrink-0 border-b-0 md:border-b border-stone-200/60 items-center gap-6">
        <h2 className="text-xl font-medium tracking-wide text-stone-800">收货地址</h2>
        <div className="flex items-center gap-4">
          <div className="w-[1px] h-4 bg-stone-200" />
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 text-[13px] tracking-wider text-stone-500 hover:text-stone-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>新增地址</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-16 py-0 scrollbar-hide flex flex-col">
        {/* 移动端新增按钮 - 仅在移动端列表顶部显示 */}
        {!loading && addresses.length > 0 && (
          <div className="md:hidden pt-6 pb-4">
            <button
              onClick={() => setEditing({} as Address)}
              className="w-full flex items-center justify-center gap-2 py-3.5 border border-dashed border-stone-300 rounded-xl text-stone-500 hover:text-stone-800 hover:border-stone-400 hover:bg-stone-50/50 transition-all font-medium tracking-wide text-[13px]"
            >
              <Plus className="w-4 h-4" />
              <span>新增收货地址</span>
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center pb-28">
            <Loader2 className="w-8 h-8 text-stone-300 animate-spin" />
          </div>
        ) : addresses.length === 0 ? (
          <m.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex flex-col items-center justify-center pb-28 text-center"
          >
            <div className="w-16 h-16 rounded-full bg-[#F9F8F6] border border-stone-200/60 flex items-center justify-center mb-5">
              <MapPin className="w-6 h-6 text-stone-300" />
            </div>
            <p className="text-stone-400 text-sm tracking-wider">暂无收货地址</p>
            <button
              onClick={() => setShowForm(true)}
              className="text-stone-800 font-medium hover:text-stone-600 transition-colors tracking-widest text-sm uppercase flex items-center gap-2 mt-6"
            >
              <Plus className="w-4 h-4 transition-transform" />
              立即添加一个地址
            </button>
          </m.div>
        ) : (
          <div className="space-y-0 pb-10">
            {addresses.map((addr) => (
              <m.div
                key={addr.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="group relative border-b border-stone-200/60 last:border-0 py-6 transition-colors hover:bg-stone-50/50 flex flex-col md:flex-row md:items-start md:justify-between gap-3 md:gap-6"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-stone-800 font-medium tracking-wide text-base">{addr.name}</span>
                    <span className="text-stone-500 font-mono text-[15px] tracking-wider">{addr.phone}</span>
                    {addr.isDefault && (
                      <span className="px-2 py-0.5 border border-stone-800 text-stone-800 text-[11px] rounded tracking-widest uppercase shrink-0">
                        默认
                      </span>
                    )}
                  </div>
                  <div className="text-[13px] font-light tracking-wide text-stone-500 block mt-2.5 leading-[1.6]">
                     {addr.province} {addr.city} {addr.district} {addr.detail}
                  </div>
                </div>

                <div className="flex items-center justify-between md:justify-end w-full md:w-auto pt-3 md:pt-0 border-t border-stone-100 md:border-transparent opacity-100 md:opacity-0 group-hover:opacity-100 transition-all shrink-0">
                  {!addr.isDefault && (
                    <button
                      onClick={() => handleSetDefault(addr.id)}
                      className="text-[13px] tracking-wider font-medium text-stone-400 hover:text-stone-800 transition-colors"
                    >
                      设为默认
                    </button>
                  )}
                  
                  <div className="flex items-center gap-5 ml-auto">
                    <button
                      onClick={() => setEditing(addr)}
                      className="text-stone-400 hover:text-stone-800 transition-colors flex items-center gap-1.5"
                    >
                      <Edit3 className="w-4 h-4" />
                      <span className="text-[13px] tracking-wider font-medium">编辑</span>
                    </button>
                    <button
                      onClick={() => handleDelete(addr.id)}
                      className="text-stone-400 hover:text-red-500 transition-colors flex items-center justify-center p-1 -mr-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </m.div>
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
    <div className="flex-1">
      <label className="block text-stone-500 text-[13px] tracking-wider uppercase mb-2">{label}</label>
      <div className="relative">
        <button
          type="button"
          onClick={() => !disabled && setOpen(!open)}
          className={`w-full px-4 py-3 bg-[#F9F8F6] border rounded-xl text-left flex items-center justify-between transition-all text-base ${disabled
            ? "border-transparent text-stone-300 cursor-not-allowed"
            : open
              ? "border-stone-400 ring-4 ring-stone-100 text-stone-800"
              : "border-stone-200/60 hover:border-stone-300 text-stone-800"
            }`}
        >
          <span className={hasValue ? "font-medium" : "text-stone-300"}>
            {value || placeholder}
          </span>
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""} ${disabled ? "opacity-20" : "opacity-40"}`} />
        </button>
        {required && <input type="text" value={value} required className="sr-only" onChange={() => { }} tabIndex={-1} />}

        <AnimatePresence>
          {open && !disabled && (
            <>
              <m.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40"
                onClick={() => setOpen(false)}
              />
              <m.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute z-50 top-full left-0 right-0 mt-2 bg-[#F9F8F6] border border-stone-200/60 rounded-xl shadow-lg max-h-60 overflow-y-auto overflow-x-hidden p-1.5 scrollbar-hide"
              >
                {options.length === 0 ? (
                  <div className="px-4 py-8 text-stone-400 text-sm text-center font-medium italic">暂无可选数据</div>
                ) : (
                  <div className="grid grid-cols-1 gap-1">
                    {options.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => { onChange(opt.label); setOpen(false); }}
                        className={`w-full px-4 py-2.5 text-left text-[14px] rounded-lg transition-all flex items-center justify-between group ${opt.label === value
                          ? "bg-[#E5E0D8]/40 text-stone-800 font-medium"
                          : "text-stone-500 hover:bg-stone-50 hover:text-stone-800"
                          }`}
                      >
                        <span className="relative z-10">{opt.label}</span>
                        {opt.label === value && (
                          <div className="w-[1.5px] h-3.5 bg-stone-800 rounded-full" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </m.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function AddressForm({ address, onClose, onSuccess }: { address: Address | null; onClose: () => void; onSuccess: () => void }) {
  const { success: showSuccess, error: showError } = useToast();
  const [form, setForm] = useState({ name: address?.name || "", phone: address?.phone || "", province: address?.province || "", city: address?.city || "", district: address?.district || "", detail: address?.detail || "", isDefault: address?.isDefault || false });
  const [saving, setSaving] = useState(false);

  const provinces = cascaderOptions;

  const cities = useMemo(() => {
    if (!form.province) return [];
    const province = provinces.find((p: CascaderOption) => p.label === form.province);
    return province?.children || [];
  }, [form.province, provinces]);

  const districts = useMemo(() => {
    if (!form.city || !cities.length) return [];
    const city = cities.find((c: CascaderOption) => c.label === form.city);
    return city?.children || [];
  }, [form.city, cities]);

  const handleProvinceChange = (provinceName: string) => {
    setForm({ ...form, province: provinceName, city: "", district: "" });
  };

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
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        throw new Error(data?.error?.message || "保存地址失败");
      }

      showSuccess(address ? "地址已更新" : "地址已添加");
      onSuccess();
    } catch (e) {
      console.error("保存失败:", e);
      const message = e instanceof Error ? e.message : "保存失败，请稍后重试";
      showError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col pt-4 md:pt-10">
      <div className="hidden md:flex px-16 pb-6 shrink-0 border-b-0 md:border-b border-stone-200/60 items-center gap-4">
        <button
          type="button"
          onClick={onClose}
          className="text-stone-400 hover:text-stone-800 transition-colors p-1 -ml-1 rounded"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-medium tracking-wide text-stone-800">
          {address ? "修改收货地址" : "添加收货地址"}
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-16 py-8 scrollbar-hide">
        <div className="space-y-6 max-w-2xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-stone-500 text-[13px] tracking-wider uppercase mb-2">收货人姓名</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-4 py-3 bg-[#F9F8F6] border border-stone-200/60 rounded-xl text-stone-800 font-medium placeholder:text-stone-300 outline-none focus:border-stone-400 focus:ring-4 focus:ring-stone-100 transition-all transition-colors"
                placeholder="请输入姓名"
                required
              />
            </div>
            <div>
              <label className="block text-stone-500 text-[13px] tracking-wider uppercase mb-2">联系电话</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "") })}
                className="w-full px-4 py-3 bg-[#F9F8F6] border border-stone-200/60 rounded-xl text-stone-800 font-medium font-mono placeholder:text-stone-300 outline-none focus:border-stone-400 focus:ring-4 focus:ring-stone-100 transition-all transition-colors"
                placeholder="收货人手机号"
                required
              />
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4">
            <RegionSelect label="省份" value={form.province} onChange={handleProvinceChange} options={provinces} placeholder="请选择省" required />
            <RegionSelect label="城市" value={form.city} onChange={handleCityChange} options={cities} placeholder="请选择市" disabled={!form.province} required />
            <RegionSelect label="区县 / 街道" value={form.district} onChange={(v) => setForm({ ...form, district: v })} options={districts} placeholder="请选择区" disabled={!form.city} required />
          </div>

          <div>
            <label className="block text-stone-500 text-[13px] tracking-wider uppercase mb-2">详细地址</label>
            <textarea
              value={form.detail}
              onChange={(e) => setForm({ ...form, detail: e.target.value })}
              className="w-full px-4 py-3 bg-[#F9F8F6] border border-stone-200/60 rounded-xl text-stone-800 font-medium placeholder:text-stone-300 outline-none focus:border-stone-400 focus:ring-4 focus:ring-stone-100 transition-all transition-colors resize-none"
              rows={3}
              placeholder="街道、门牌号等详细信息"
              required
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer group w-fit mt-2">
            <div className="relative flex items-center justify-center">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                className="peer sr-only"
              />
              <div className="w-5 h-5 rounded border-2 border-stone-300 bg-white transition-colors peer-checked:bg-stone-800 peer-checked:border-stone-800 group-hover:border-stone-400" />
              <Check className="absolute w-3.5 h-3.5 text-white pointer-events-none scale-0 peer-checked:scale-100 transition-transform" strokeWidth={3} />
            </div>
            <span className="text-stone-600 text-[14px] font-medium tracking-wide select-none group-hover:text-stone-900 transition-colors">
              设为默认收货地址
            </span>
          </label>
        </div>

        <div className="mt-12 flex items-center justify-end gap-10 max-w-2xl">
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] text-stone-400 hover:text-stone-800 font-light tracking-[0.2em] uppercase transition-all"
          >
            取消编辑
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-3 text-[13px] text-stone-800 font-medium tracking-[0.2em] uppercase group disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            <span className="border-b border-stone-800 pb-0.5 group-hover:border-stone-400 transition-colors">
              确认保存地址
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}
