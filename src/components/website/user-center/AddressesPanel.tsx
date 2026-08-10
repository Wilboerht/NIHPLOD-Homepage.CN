"use client";

import { useState, useEffect, useMemo } from "react";
import { MapPin, Edit3, Trash2, Loader2, Check, ChevronDown, Plus, ArrowLeft } from "lucide-react";
import cascaderOptions, { type CascaderOption } from "@pansy/china-division";
import { m, AnimatePresence } from "framer-motion";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api-client";
import { deferInEffect } from "@/hooks/deferInEffect";

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

  const fetchAddresses = async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ addresses: Address[] }>("/api/user/addresses");
      setAddresses(data.addresses || []);
    } catch (e) {
      console.error("获取地址失败:", e);
      showError("获取地址失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    deferInEffect(fetchAddresses);
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除此地址？")) return;
    try {
      await apiDelete(`/api/user/addresses/${id}`);
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
      await apiPut(`/api/user/addresses/${id}/default`);
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
        onClose={() => {
          setShowForm(false);
          setEditing(null);
        }}
        onSuccess={() => {
          setShowForm(false);
          setEditing(null);
          fetchAddresses();
        }}
      />
    );
  }

  return (
    <div className="flex h-full flex-col pt-4 md:pt-10">
      <div className="hidden shrink-0 items-center gap-6 border-b-0 border-stone-200/60 px-16 pb-6 md:flex md:border-b">
        <h2 className="text-xl font-medium tracking-wide text-stone-800">收货地址</h2>
        <div className="flex items-center gap-4">
          <div className="h-4 w-[1px] bg-stone-200" />
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 text-[13px] tracking-wider text-stone-500 transition-colors hover:text-stone-800"
          >
            <Plus className="h-4 w-4" />
            <span>新增地址</span>
          </button>
        </div>
      </div>

      <div className="scrollbar-hide flex flex-1 flex-col overflow-y-auto px-16 py-0">
        {/* 移动端新增按钮 - 仅在移动端列表顶部显示 */}
        {!loading && addresses.length > 0 && (
          <div className="pb-4 pt-6 md:hidden">
            <button
              onClick={() => setEditing({} as Address)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-stone-300 py-3.5 text-[13px] font-medium tracking-wide text-stone-500 transition-all hover:border-stone-400 hover:bg-stone-50/50 hover:text-stone-800"
            >
              <Plus className="h-4 w-4" />
              <span>新增收货地址</span>
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex flex-1 items-center justify-center pb-28">
            <Loader2 className="h-8 w-8 animate-spin text-stone-300" />
          </div>
        ) : addresses.length === 0 ? (
          <m.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-1 flex-col items-center justify-center pb-28 text-center"
          >
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-stone-200/60 bg-[#FBF8F0]/60 backdrop-blur-sm">
              <MapPin className="h-6 w-6 text-stone-300" />
            </div>
            <p className="text-sm tracking-wider text-stone-400">暂无收货地址</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-6 flex items-center gap-2 text-sm font-medium uppercase tracking-widest text-stone-800 transition-colors hover:text-stone-600"
            >
              <Plus className="h-4 w-4 transition-transform" />
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
                className="group relative -mx-6 flex flex-col gap-3 rounded-[2.5rem] border-b border-stone-200/60 px-6 py-6 transition-all last:border-0 hover:bg-white/40 md:flex-row md:items-start md:justify-between md:gap-6"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex items-center gap-3">
                    <span className="text-base font-medium tracking-wide text-stone-800">
                      {addr.name}
                    </span>
                    <span className="font-mono text-[15px] tracking-wider text-stone-500">
                      {addr.phone}
                    </span>
                    {addr.isDefault && (
                      <span className="shrink-0 rounded border border-stone-800 px-2 py-0.5 text-[11px] uppercase tracking-widest text-stone-800">
                        默认
                      </span>
                    )}
                  </div>
                  <div className="mt-2.5 block text-[13px] font-light leading-[1.6] tracking-wide text-stone-500">
                    {addr.province} {addr.city} {addr.district} {addr.detail}
                  </div>
                </div>

                <div className="flex w-full shrink-0 items-center justify-between border-t border-stone-100 pt-3 opacity-100 transition-all group-hover:opacity-100 md:w-auto md:justify-end md:gap-8 md:border-transparent md:pt-0 md:opacity-0">
                  {!addr.isDefault && (
                    <button
                      onClick={() => handleSetDefault(addr.id)}
                      className="text-[13px] font-medium tracking-wider text-stone-400 transition-colors hover:text-stone-800"
                    >
                      设为默认
                    </button>
                  )}

                  <div className="flex items-center gap-5">
                    <button
                      onClick={() => setEditing(addr)}
                      className="flex items-center gap-1.5 text-stone-400 transition-colors hover:text-stone-800"
                    >
                      <Edit3 className="h-4 w-4" />
                      <span className="text-[13px] font-medium tracking-wider">编辑</span>
                    </button>
                    <button
                      onClick={() => handleDelete(addr.id)}
                      className="-mr-1 flex items-center justify-center p-1 text-stone-400 transition-colors hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
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
function RegionSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  required,
}: {
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
      <label className="mb-2 block text-[13px] uppercase tracking-wider text-stone-500">
        {label}
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => !disabled && setOpen(!open)}
          className={`flex w-full items-center justify-between rounded-xl border bg-[#FBF8F0]/40 px-4 py-3 text-left text-base backdrop-blur-sm transition-all ${
            disabled
              ? "cursor-not-allowed border-transparent text-stone-300"
              : open
                ? "border-stone-400 text-stone-800 ring-4 ring-stone-100"
                : "border-stone-200/60 text-stone-800 hover:border-stone-300"
          }`}
        >
          <span className={hasValue ? "font-medium" : "text-stone-300"}>
            {value || placeholder}
          </span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""} ${disabled ? "opacity-20" : "opacity-40"}`}
          />
        </button>
        {required && (
          <input
            type="text"
            value={value}
            required
            className="sr-only"
            onChange={() => {}}
            tabIndex={-1}
          />
        )}

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
                className="scrollbar-hide absolute left-0 right-0 top-full z-50 mt-2 max-h-60 overflow-y-auto overflow-x-hidden rounded-xl border border-stone-200/60 bg-[#FBF8F0]/95 p-1.5 shadow-lg backdrop-blur-xl"
              >
                {options.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm font-medium italic text-stone-400">
                    暂无可选数据
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-1">
                    {options.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          onChange(opt.label);
                          setOpen(false);
                        }}
                        className={`group flex w-full items-center justify-between rounded-lg px-4 py-2.5 text-left text-[14px] transition-all ${
                          opt.label === value
                            ? "bg-[#FBF8F0]/40 font-medium text-stone-800"
                            : "text-stone-500 hover:bg-stone-50 hover:text-stone-800"
                        }`}
                      >
                        <span className="relative z-10">{opt.label}</span>
                        {opt.label === value && (
                          <div className="h-3.5 w-[1.5px] rounded-full bg-stone-800" />
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

function AddressForm({
  address,
  onClose,
  onSuccess,
}: {
  address: Address | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { success: showSuccess, error: showError } = useToast();
  const [form, setForm] = useState({
    name: address?.name || "",
    phone: address?.phone || "",
    province: address?.province || "",
    city: address?.city || "",
    district: address?.district || "",
    detail: address?.detail || "",
    isDefault: address?.isDefault || false,
  });
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
      if (address) {
        await apiPut(`/api/user/addresses/${address.id}`, form);
      } else {
        await apiPost("/api/user/addresses", form);
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
    <div className="flex h-full flex-col pt-4 md:pt-10">
      <div className="hidden shrink-0 items-center gap-4 border-b-0 border-stone-200/60 px-16 pb-6 md:flex md:border-b">
        <button
          type="button"
          onClick={onClose}
          className="-ml-1 rounded p-1 text-stone-400 transition-colors hover:text-stone-800"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="text-xl font-medium tracking-wide text-stone-800">
          {address ? "修改收货地址" : "添加收货地址"}
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="scrollbar-hide flex-1 overflow-y-auto px-16 py-8">
        <div className="max-w-2xl space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-[13px] uppercase tracking-wider text-stone-500">
                收货人姓名
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-xl border border-stone-200/60 bg-[#FBF8F0]/40 px-4 py-3 font-medium text-stone-800 outline-none backdrop-blur-sm transition-all transition-colors placeholder:text-stone-300 focus:border-stone-400 focus:ring-4 focus:ring-stone-100"
                placeholder="请输入姓名"
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-[13px] uppercase tracking-wider text-stone-500">
                联系电话
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "") })}
                className="w-full rounded-xl border border-stone-200/60 bg-[#FBF8F0]/40 px-4 py-3 font-medium text-stone-800 outline-none backdrop-blur-sm transition-all transition-colors placeholder:text-stone-300 focus:border-stone-400 focus:ring-4 focus:ring-stone-100"
                placeholder="收货人手机号"
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-4 md:flex-row">
            <RegionSelect
              label="省份"
              value={form.province}
              onChange={handleProvinceChange}
              options={provinces}
              placeholder="请选择省"
              required
            />
            <RegionSelect
              label="城市"
              value={form.city}
              onChange={handleCityChange}
              options={cities}
              placeholder="请选择市"
              disabled={!form.province}
              required
            />
            <RegionSelect
              label="区县 / 街道"
              value={form.district}
              onChange={(v) => setForm({ ...form, district: v })}
              options={districts}
              placeholder="请选择区"
              disabled={!form.city}
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-[13px] uppercase tracking-wider text-stone-500">
              详细地址
            </label>
            <textarea
              value={form.detail}
              onChange={(e) => setForm({ ...form, detail: e.target.value })}
              className="w-full resize-none rounded-xl border border-stone-200/60 bg-[#FBF8F0]/40 px-4 py-3 font-medium text-stone-800 outline-none backdrop-blur-sm transition-all transition-colors placeholder:text-stone-300 focus:border-stone-400 focus:ring-4 focus:ring-stone-100"
              rows={3}
              placeholder="街道、门牌号等详细信息"
              required
            />
          </div>

          <label className="group mt-2 flex w-fit cursor-pointer items-center gap-3">
            <div className="relative flex items-center justify-center">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                className="peer sr-only"
              />
              <div className="h-5 w-5 rounded border-2 border-stone-300 bg-white transition-colors group-hover:border-stone-400 peer-checked:border-stone-800 peer-checked:bg-stone-800" />
              <Check
                className="pointer-events-none absolute h-3.5 w-3.5 scale-0 text-white transition-transform peer-checked:scale-100"
                strokeWidth={3}
              />
            </div>
            <span className="select-none text-[14px] font-medium tracking-wide text-stone-600 transition-colors group-hover:text-stone-900">
              设为默认收货地址
            </span>
          </label>
        </div>

        <div className="mt-12 flex max-w-2xl items-center justify-end gap-10">
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] font-light uppercase tracking-[0.2em] text-stone-400 transition-all hover:text-stone-800"
          >
            取消编辑
          </button>
          <button
            type="submit"
            disabled={saving}
            className="group flex items-center gap-3 text-[13px] font-medium uppercase tracking-[0.2em] text-stone-800 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            <span className="border-b border-stone-800 pb-0.5 transition-colors group-hover:border-stone-400">
              确认保存地址
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}
