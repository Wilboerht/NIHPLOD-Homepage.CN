"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";
import { apiGet, ApiError } from "@/lib/api-client";

export interface AmapLocationPickerProps {
  value: string;
  onChange: (val: string) => void;
  /** 选中建议项时回传坐标；手动修改文本时回传 null 表示坐标已失效 */
  onCoordsChange: (lng: number | null, lat: number | null) => void;
  error?: string;
}

interface AmapTip {
  name: string;
  district: string;
  address: string;
  lng: number;
  lat: number;
}

/**
 * 高德地图地址选择器。
 *
 * 搜索建议走服务端代理 /api/admin/amap/search，浏览器不接触 AMAP_KEY / AMAP_SECRET。
 * 服务端未配置 AMAP_WEB_SERVICE_KEY 时降级为纯文本输入 + 手动经纬度。
 */
export function AmapLocationPicker({
  value,
  onChange,
  onCoordsChange,
  error,
}: AmapLocationPickerProps) {
  const [suggestions, setSuggestions] = useState<AmapTip[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = useRef(0);

  const search = async (keyword: string) => {
    const trimmed = keyword.trim();
    if (!trimmed) {
      setSuggestions([]);
      setOpen(false);
      setSelectedIndex(-1);
      return;
    }

    const seq = ++searchSeqRef.current;
    setLoading(true);
    try {
      const data = await apiGet<{ tips: AmapTip[] }>("/api/admin/amap/search", {
        keyword: trimmed,
      });
      if (seq !== searchSeqRef.current) return;
      const tips = data.tips ?? [];
      setSuggestions(tips);
      setOpen(tips.length > 0);
      setUnavailable(false);
    } catch (error) {
      if (seq !== searchSeqRef.current) return;
      if (error instanceof ApiError && error.status === 503) {
        setUnavailable(true);
      }
      setSuggestions([]);
      setOpen(false);
    } finally {
      if (seq === searchSeqRef.current) setLoading(false);
    }
  };

  const handleSearch = (keyword: string) => {
    onChange(keyword);
    // 手动改动文本后原坐标不再对应当前地址，先清空避免保存旧坐标
    onCoordsChange(null, null);

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      void search(keyword);
    }, 300);
  };

  const selectSuggestion = (tip: AmapTip) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchSeqRef.current += 1;
    onChange(`${tip.district}${tip.name}`);
    onCoordsChange(tip.lng, tip.lat);
    setOpen(false);
    setSelectedIndex(-1);
  };

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <label
        htmlFor="amap-location-input"
        className="mb-1.5 block text-sm font-medium text-brand-charcoal/80"
      >
        工作地点 <span className="text-red-500">*</span>
      </label>
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-charcoal/65" />
        <input
          id="amap-location-input"
          type="text"
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-controls="amap-suggestion-list"
          aria-autocomplete="list"
          aria-activedescendant={selectedIndex >= 0 ? `amap-option-${selectedIndex}` : undefined}
          value={value}
          placeholder={
            unavailable ? "地点搜索暂不可用，可直接填写工作地点" : "搜索工作地点，如：信泰中心广场"
          }
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
          onChange={(event) => handleSearch(event.target.value)}
          onKeyDown={(event) => {
            if (!open || suggestions.length === 0) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setSelectedIndex((prev) => Math.max(prev - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
                selectSuggestion(suggestions[selectedIndex]);
              }
            } else if (event.key === "Escape") {
              setOpen(false);
              setSelectedIndex(-1);
            }
          }}
          autoComplete="off"
          className={`h-10 w-full rounded-lg border pl-9 pr-9 text-sm outline-none transition-colors focus:ring-1 ${
            error
              ? "border-red-400 focus:border-red-400 focus:ring-red-400"
              : "border-brand-charcoal/15 focus:border-brand-primary focus:ring-brand-primary"
          }`}
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-brand-charcoal/50" />
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      {unavailable && !error && (
        <p className="mt-1 text-xs text-brand-charcoal/65">
          地点搜索由服务端代理，当前未配置
          AMAP_WEB_SERVICE_KEY；可直接填写地点，并手动录入经纬度（选填）。
        </p>
      )}

      {open && suggestions.length > 0 && (
        <ul
          id="amap-suggestion-list"
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-brand-charcoal/15 bg-white shadow-xl"
        >
          {suggestions.map((tip, index) => (
            <li
              key={`${tip.name}-${tip.lng}-${tip.lat}-${index}`}
              id={`amap-option-${index}`}
              role="option"
              aria-selected={index === selectedIndex}
              onMouseDown={(event) => {
                event.preventDefault();
                selectSuggestion(tip);
              }}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`flex cursor-pointer flex-col px-4 py-2 ${
                index === selectedIndex ? "bg-brand-primary/10" : "hover:bg-brand-charcoal/[0.03]"
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-medium text-brand-charcoal">
                <Search className="h-3.5 w-3.5 text-brand-charcoal/65" />
                {tip.name}
              </div>
              <div className="ml-5 text-xs text-brand-charcoal/65">
                {tip.district}
                {tip.address || ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
