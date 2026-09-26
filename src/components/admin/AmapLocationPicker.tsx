"use client";

import { useState, useRef, useEffect } from "react";
import { MapPin, Search } from "lucide-react";

export interface AmapLocationPickerProps {
  value: string;
  onChange: (val: string) => void;
  /** 选中建议项时回传坐标；手动修改文本时回传 null 表示坐标已失效 */
  onCoordsChange: (lng: number | null, lat: number | null) => void;
  error?: string;
}

/**
 * 高德地图地址选择器组件
 * 提供地点搜索建议、自动补全和坐标返回
 */
export function AmapLocationPicker({
  value,
  onChange,
  onCoordsChange,
  error,
}: AmapLocationPickerProps) {
  const [suggestions, setSuggestions] = useState<AMap.Tip[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const autoCompleteRef = useRef<AMap.Autocomplete | null>(null);
  // 搜索防抖与过期响应丢弃
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = useRef(0);

  // Amap 密钥从服务端 API 获取，不通过 NEXT_PUBLIC_ 编入客户端 bundle
  const [amapKey, setAmapKey] = useState("");
  const [amapSecret, setAmapSecret] = useState("");
  // 非超级管理员（403）或无密钥配置时降级为纯文本输入 + 手动经纬度
  const [amapUnavailable, setAmapUnavailable] = useState(false);

  useEffect(() => {
    fetch("/api/admin/amap-config", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`http_${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (d?.data?.key && d?.data?.secret) {
          setAmapKey(d.data.key);
          setAmapSecret(d.data.secret);
        } else {
          setAmapUnavailable(true);
        }
      })
      .catch(() => setAmapUnavailable(true));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || window.AMap) return;
    if (!amapKey || !amapSecret) return;

    // 防止重复插入脚本
    const existing = document.querySelector('script[src*="webapi.amap.com"]');
    if (existing) return;

    // 配置安全密钥
    window._AMapSecurityConfig = {
      securityJsCode: amapSecret,
    };

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${amapKey}&plugin=AMap.Autocomplete,AMap.PlaceSearch,AMap.Geocoder`;
    document.head.appendChild(script);

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [amapKey, amapSecret]);

  // 搜索建议逻辑（地图不可用时仅回填文本，不查询建议）
  const handleSearch = (keyword: string) => {
    onChange(keyword);
    // 手动改动文本后原坐标不再对应当前地址，先清空避免保存旧坐标
    onCoordsChange(null, null);

    const amap = window.AMap;
    if (amapUnavailable || !amap) {
      return;
    }

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    const seq = ++searchSeqRef.current;

    if (!keyword.trim()) {
      setSuggestions([]);
      setOpen(false);
      setSelectedIndex(-1);
      return;
    }

    // 防抖 300ms，避免每次击键都请求并丢弃过期响应
    searchDebounceRef.current = setTimeout(() => {
      amap.plugin(["AMap.Autocomplete"], () => {
        if (seq !== searchSeqRef.current) return;
        if (!autoCompleteRef.current) {
          autoCompleteRef.current = new amap.Autocomplete({
            city: "上海",
          });
        }

        autoCompleteRef.current.search(
          keyword,
          (status: string, result: AMap.AutocompleteResult) => {
            if (seq !== searchSeqRef.current) return;
            if (status === "complete" && result.tips) {
              setSuggestions(result.tips.filter((t) => t.location));
              setOpen(true);
            } else {
              setSuggestions([]);
            }
          }
        );
      });
    }, 300);
  };

  // 卸载时清理防抖定时器
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []);

  const selectSuggestion = (tip: AMap.Tip) => {
    const fullLocation = `${tip.district}${tip.name}`;
    // 先取消进行中的防抖搜索，避免建议列表在选中后又被旧响应覆盖
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchSeqRef.current += 1;
    onChange(fullLocation);
    if (tip.location) {
      onCoordsChange(tip.location.lng, tip.location.lat);
    }
    setOpen(false);
    setSelectedIndex(-1);
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
      <label
        htmlFor="amap-location-input"
        className="mb-1.5 block text-sm font-medium text-brand-charcoal/80"
      >
        工作地点 <span className="text-red-500">*</span>
      </label>
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-charcoal/50" />
        <input
          id="amap-location-input"
          type="text"
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-controls="amap-suggestion-list"
          aria-autocomplete="list"
          aria-activedescendant={
            selectedIndex >= 0 ? `amap-option-${selectedIndex}` : undefined
          }
          value={value}
          placeholder={
            amapUnavailable ? "填写工作地点，如：上海市普陀区信泰中心广场" : "搜索工作地点，如：信泰中心广场"
          }
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
          onChange={(e) => handleSearch(e.target.value)}
          onKeyDown={(e) => {
            if (!open || suggestions.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelectedIndex((prev) => Math.max(prev - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
                selectSuggestion(suggestions[selectedIndex]);
              }
            } else if (e.key === "Escape") {
              setOpen(false);
              setSelectedIndex(-1);
            }
          }}
          autoComplete="off"
          className={`h-10 w-full rounded-lg border pl-9 pr-3 text-sm outline-none transition-colors focus:ring-1 ${
            error
              ? "border-red-400 focus:border-red-400 focus:ring-red-400"
              : "border-brand-charcoal/15 focus:border-brand-primary focus:ring-brand-primary"
          }`}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      {amapUnavailable && !error && (
        <p className="mt-1 text-xs text-brand-charcoal/40">
          地图搜索仅超级管理员可用，可直接填写地点，并在下方手动录入经纬度（选填）
        </p>
      )}

      {/* 下拉建议列表 */}
      {open && suggestions.length > 0 && (
        <ul
          id="amap-suggestion-list"
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-brand-charcoal/15 bg-white shadow-xl"
        >
          {suggestions.map((tip, index) => (
            <li
              key={index}
              id={`amap-option-${index}`}
              role="option"
              aria-selected={index === selectedIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                selectSuggestion(tip);
              }}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`flex cursor-pointer flex-col px-4 py-2 ${
                index === selectedIndex ? "bg-brand-primary/10" : "hover:bg-brand-charcoal/[0.03]"
              }`}
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
