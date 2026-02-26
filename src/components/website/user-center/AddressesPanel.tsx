"use client";

import { useState, useEffect, useMemo } from "react";
import { MapPin, Edit3, Trash2, Loader2, Check, ChevronDown, Plus, ArrowLeft } from "lucide-react";
import cascaderOptions, { type CascaderOption } from "@pansy/china-division";
import { m, AnimatePresence } from "framer-motion";

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
    return (
      <AddressForm
        address={editing}
        onClose={() => { setShowForm(false); setEditing(null); }}
        onSuccess={() => { setShowForm(false); setEditing(null); fetchAddresses(); }}
      />
    );
  }

  return (
    <div className="h-full flex flex-col pt-6 md:pt-10">
      <div className="flex-shrink-0 px-6 md:px-10 pb-6">
        <div className="flex items-center justify-start gap-4 mb-2">
          <h2 className="text-2xl font-semibold tracking-[0.05em] text-brand-charcoal">收货地址</h2>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-gold/15 text-[#8B7355] border border-brand-gold/30 backdrop-blur-md rounded-xl text-sm font-bold tracking-wide shadow-sm hover:bg-brand-gold/25 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <Plus className="w-4 h-4" strokeWidth={3} />
            <span>新增地址</span>
          </button>
        </div>
        <p className="text-brand-charcoal/50 text-sm tracking-wide">管理您的常用收货信息</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-10 py-2 scrollbar-hide">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-brand-gold animate-spin" />
          </div>
        ) : addresses.length === 0 ? (
          <m.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <div className="w-20 h-20 rounded-full bg-black/5 md:bg-white/30 backdrop-blur-md flex items-center justify-center mb-5 border border-black/5 md:border-white/40 shadow-inner text-brand-charcoal/20">
              <MapPin className="w-9 h-9" />
            </div>
            <p className="text-brand-charcoal/50 font-medium tracking-wide mb-6">暂无收货地址</p>
            <button
              onClick={() => setShowForm(true)}
              className="text-brand-gold font-bold hover:text-brand-gold-dark transition-colors tracking-widest text-sm uppercase flex items-center gap-2 group"
            >
              <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" />
              立即添加一个地址
            </button>
          </m.div>
        ) : (
          <div className="space-y-4 pb-10">
            {addresses.map((addr) => (
              <m.div
                key={addr.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`group relative bg-black/[0.02] md:bg-white/30 rounded-[1.5rem] p-6 border transition-all backdrop-blur-md shadow-sm hover:shadow-md ${addr.isDefault
                  ? "border-brand-gold/40 shadow-brand-gold/5"
                  : "border-black/5 md:border-white/50 hover:border-brand-gold/20"
                  }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      <span className="text-brand-charcoal font-bold text-lg tracking-wide">{addr.name}</span>
                      <span className="text-brand-charcoal/60 font-mono font-medium">{addr.phone}</span>
                      {addr.isDefault && (
                        <span className="px-2.5 py-0.5 bg-brand-gold/15 text-[#8B7355] text-[11px] font-bold rounded-lg tracking-widest uppercase border border-brand-gold/30 backdrop-blur-sm shadow-sm">
                          默认
                        </span>
                      )}
                    </div>
                    <div className="flex items-start gap-2 text-brand-charcoal/70 leading-relaxed text-base">
                      <MapPin className="w-4 h-4 mt-1 shrink-0 opacity-40 text-brand-gold" />
                      <p className="tracking-wide">
                        <span className="font-semibold text-brand-charcoal/40 mr-1">{addr.province} {addr.city} {addr.district}</span>
                        {addr.detail}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setEditing(addr)}
                      className="p-2.5 rounded-full bg-black/5 md:bg-white/40 text-brand-charcoal/40 hover:text-brand-gold hover:bg-white transition-all shadow-sm border border-transparent hover:border-brand-gold/20 group/btn"
                      title="编辑"
                    >
                      <Edit3 className="w-4 h-4 group-hover/btn:scale-110 transition-transform" />
                    </button>
                    <button
                      onClick={() => handleDelete(addr.id)}
                      className="p-2.5 rounded-full bg-black/5 md:bg-white/40 text-brand-charcoal/40 hover:text-red-500 hover:bg-white transition-all shadow-sm border border-transparent hover:border-red-100 group/btn"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4 group-hover/btn:scale-110 transition-transform" />
                    </button>
                  </div>
                </div>

                {!addr.isDefault && (
                  <button
                    onClick={() => handleSetDefault(addr.id)}
                    className="mt-5 text-[12px] font-bold text-brand-charcoal/40 hover:text-brand-gold tracking-[0.15em] uppercase flex items-center gap-1.5 transition-all group/default"
                  >
                    <div className="w-4 h-4 rounded-full border border-black/10 md:border-white/40 flex items-center justify-center group-hover/default:border-brand-gold transition-colors">
                      <div className="w-1.5 h-1.5 rounded-full bg-brand-gold scale-0 group-hover/default:scale-100 transition-transform" />
                    </div>
                    设为默认地址
                  </button>
                )}
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
      <label className="block text-brand-charcoal/50 text-[13px] font-bold tracking-wider uppercase mb-2 ml-1">{label}</label>
      <div className="relative">
        <button
          type="button"
          onClick={() => !disabled && setOpen(!open)}
          className={`w-full px-4 py-3 border rounded-xl text-left flex items-center justify-between transition-all backdrop-blur-md shadow-sm text-base ${disabled
            ? "bg-black/5 border-transparent text-brand-charcoal/20 cursor-not-allowed"
            : open
              ? "border-brand-gold/60 ring-4 ring-brand-gold/5 bg-white text-brand-charcoal"
              : "border-black/5 md:border-white/50 hover:border-brand-gold/40 bg-black/[0.02] md:bg-white/20 text-brand-charcoal"
            }`}
        >
          <span className={hasValue ? "font-medium" : "text-brand-charcoal/30"}>
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
                className="absolute z-50 top-full left-0 right-0 mt-2 bg-white/95 backdrop-blur-xl border border-black/5 rounded-2xl shadow-2xl max-h-60 overflow-y-auto overflow-x-hidden p-1.5 scrollbar-hide"
              >
                {options.length === 0 ? (
                  <div className="px-4 py-8 text-brand-charcoal/30 text-sm text-center font-medium italic">暂无可选数据</div>
                ) : (
                  <div className="grid grid-cols-1 gap-1">
                    {options.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => { onChange(opt.label); setOpen(false); }}
                        className={`w-full px-3.5 py-2.5 text-left text-[14px] rounded-xl transition-all font-medium ${opt.label === value
                          ? "bg-brand-gold text-white shadow-md shadow-brand-gold/20"
                          : "text-brand-charcoal hover:bg-black/5"
                          }`}
                      >
                        {opt.label}
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
      if (res.ok) onSuccess();
    } catch (e) {
      console.error("保存失败:", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col pt-6 md:pt-10">
      <div className="flex-shrink-0 px-6 md:px-10 pb-6 border-b border-black/5 md:border-white/30">
        <button
          onClick={onClose}
          className="group flex items-center gap-2 text-brand-charcoal/50 hover:text-brand-charcoal transition-colors mb-6"
        >
          <div className="w-7 h-7 rounded-full bg-black/5 md:bg-white/40 flex items-center justify-center group-hover:bg-black/10 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </div>
          <span className="text-[14px] font-medium tracking-wide">返回地址列表</span>
        </button>
        <h2 className="text-2xl font-semibold tracking-[0.05em] text-brand-charcoal">
          {address ? "修改收货地址" : "添加收货地址"}
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 md:px-10 py-8 scrollbar-hide">
        <div className="space-y-8 max-w-2xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="group">
              <label className="block text-brand-charcoal/50 text-[12px] font-bold tracking-wider uppercase mb-2 ml-1">收货人姓名</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-4 py-3 bg-black/[0.02] md:bg-white/20 border border-black/5 md:border-white/50 rounded-xl text-brand-charcoal font-medium placeholder:text-brand-charcoal/20 outline-none focus:border-brand-gold/60 focus:ring-4 focus:ring-brand-gold/5 transition-all shadow-sm"
                placeholder="请输入姓名"
                required
              />
            </div>
            <div className="group">
              <label className="block text-brand-charcoal/50 text-[12px] font-bold tracking-wider uppercase mb-2 ml-1">联系电话</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "") })}
                className="w-full px-4 py-3 bg-black/[0.02] md:bg-white/20 border border-black/5 md:border-white/50 rounded-xl text-brand-charcoal font-medium placeholder:text-brand-charcoal/20 outline-none focus:border-brand-gold/60 focus:ring-4 focus:ring-brand-gold/5 transition-all shadow-sm font-mono"
                placeholder="收货人及验证手机号"
                required
              />
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4">
            <RegionSelect label="所属省份" value={form.province} onChange={handleProvinceChange} options={provinces} placeholder="请选择省" required />
            <RegionSelect label="城市" value={form.city} onChange={handleCityChange} options={cities} placeholder="请选择市" disabled={!form.province} required />
            <RegionSelect label="区县 / 街道" value={form.district} onChange={(v) => setForm({ ...form, district: v })} options={districts} placeholder="请选择区" disabled={!form.city} required />
          </div>

          <div className="group">
            <label className="block text-brand-charcoal/50 text-[12px] font-bold tracking-wider uppercase mb-2 ml-1">详细地址</label>
            <textarea
              value={form.detail}
              onChange={(e) => setForm({ ...form, detail: e.target.value })}
              className="w-full px-4 py-4 bg-black/[0.02] md:bg-white/20 border border-black/5 md:border-white/50 rounded-2xl text-brand-charcoal font-medium placeholder:text-brand-charcoal/20 outline-none focus:border-brand-gold/60 focus:ring-4 focus:ring-brand-gold/5 transition-all shadow-sm resize-none"
              rows={3}
              placeholder="街道、门牌号等详细信息"
              required
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer group/check w-fit">
            <div className="relative">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                className="peer sr-only"
              />
              <div className="h-6 w-6 rounded-lg border-2 border-black/10 md:border-white/40 bg-white/20 transition-all peer-checked:bg-brand-gold peer-checked:border-brand-gold" />
              <Check className="absolute inset-0 h-6 w-6 scale-0 text-white transition-transform peer-checked:scale-75" strokeWidth={4} />
            </div>
            <span className="text-brand-charcoal/70 text-[14px] font-bold tracking-widest uppercase select-none group-hover/check:text-brand-charcoal transition-colors">设为默认收货地址</span>
          </label>
        </div>

        <div className="mt-12 flex gap-4 max-w-2xl">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-4 border border-black/10 md:border-white/40 text-brand-charcoal/60 rounded-xl font-bold tracking-[0.2em] uppercase hover:bg-black/5 md:hover:bg-white/30 transition-all active:scale-[0.98]"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-4 bg-brand-gold text-white rounded-xl font-bold tracking-[0.2em] uppercase shadow-lg shadow-brand-gold/20 hover:bg-brand-gold-dark hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" strokeWidth={3} />}
            <span>确认保存</span>
          </button>
        </div>
      </form>
    </div>
  );
}
