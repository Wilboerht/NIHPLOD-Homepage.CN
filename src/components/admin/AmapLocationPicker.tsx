"use client";

import { useState, useRef, useEffect } from "react";
import { MapPin, Search } from "lucide-react";

// 高德地图 Key 与安全密钥从环境变量读取
const AMAP_KEY = process.env.NEXT_PUBLIC_AMAP_KEY;
const AMAP_SECRET = process.env.NEXT_PUBLIC_AMAP_SECRET;

export interface AmapLocationPickerProps {
  value: string;
  onChange: (val: string) => void;
  onCoordsChange: (lng: number, lat: number) => void;
  error?: string;
}

/**
 * 高德地图地址选择器组件
 * 提供地点搜索建议、自动补全和坐标返回
 */
export function AmapLocationPicker({ value, onChange, onCoordsChange, error }: AmapLocationPickerProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autoCompleteRef = useRef<any>(null);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof window === "undefined" || (window as any).AMap) return;

    // 防止重复插入脚本
    const existing = document.querySelector('script[src*="webapi.amap.com"]');
    if (existing) return;

    // 配置安全密钥
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any)._AMapSecurityConfig = {
      securityJsCode: AMAP_SECRET,
    };

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}&plugin=AMap.Autocomplete,AMap.PlaceSearch,AMap.Geocoder`;
    document.head.appendChild(script);

    return () => {
      // 清理：仅移除当前组件添加的脚本
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  // 搜索建议逻辑
  const handleSearch = (keyword: string) => {
    onChange(keyword);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AMap = (window as any).AMap;
    if (!AMap) return;

    if (keyword.trim()) {
      AMap.plugin(["AMap.Autocomplete"], () => {
        if (!autoCompleteRef.current) {
          autoCompleteRef.current = new AMap.Autocomplete({
            city: "上海",
          });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        autoCompleteRef.current.search(keyword, (status: string, result: any) => {
          if (status === "complete" && result.tips) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setSuggestions(result.tips.filter((t: any) => t.location));
            setOpen(true);
          } else {
            setSuggestions([]);
          }
        });
      });
    } else {
      setSuggestions([]);
      setOpen(false);
    }
  };

  // 点击外部关闭
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <label className="mb-1.5 block text-sm font-medium text-brand-charcoal/80">
        工作地点 <span className="text-red-500">*</span>
      </label>
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-charcoal/50" />
        <input
          id="amap-location-input"
          type="text"
          value={value}
          placeholder="搜索工作地点，如：信泰中心广场"
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
          onChange={(e) => handleSearch(e.target.value)}
          autoComplete="off"
          className={`h-10 w-full rounded-lg border pl-9 pr-3 text-sm outline-none transition-colors focus:ring-1 ${
            error
              ? "border-red-400 focus:border-red-400 focus:ring-red-400"
              : "border-brand-charcoal/15 focus:border-brand-primary focus:ring-brand-primary"
          }`}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}

      {/* 下拉建议列表 */}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-brand-charcoal/15 bg-white shadow-xl">
          {suggestions.map((tip, index) => (
            <li
              key={index}
              onMouseDown={(e) => {
                e.preventDefault();
                const fullLocation =
                  tip.address && typeof tip.address === "string" && !tip.name.includes(tip.address)
                    ? `${tip.district}${tip.name}`
                    : `${tip.district}${tip.name}`;

                onChange(fullLocation);
                if (tip.location) {
                  onCoordsChange(tip.location.lng, tip.location.lat);
                }
                setOpen(false);
              }}
              className="flex cursor-pointer flex-col px-4 py-2 hover:bg-brand-charcoal/[0.03]"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-brand-charcoal">
                <Search className="h-3.5 w-3.5 text-brand-charcoal/50" />
                {tip.name}
              </div>
              <div className="ml-5 text-xs text-brand-charcoal/50">
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
