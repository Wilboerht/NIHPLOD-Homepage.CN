"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { Switch } from "@/components/ui/Switch";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { MapPin, Search } from "lucide-react";

// 高德地图 Key 与 安全密钥从环境变量读取
const AMAP_KEY = process.env.NEXT_PUBLIC_AMAP_KEY;
const AMAP_SECRET = process.env.NEXT_PUBLIC_AMAP_SECRET;

// 职位类型选项
const JOB_TYPES = [
  { label: "全职", value: "fulltime" },
  { label: "兼职", value: "parttime" },
  { label: "实习", value: "intern" },
];

interface Job {
  id: string;
  title: string;
  titleEn: string | null;
  location: string;
  type: string;
  description: string;
  requirements: string;
  salary: string | null;
  order: number;
  published: boolean;
  longitude?: number | null;
  latitude?: number | null;
}

interface JobFormProps {
  jobId?: string;
  initialData?: Partial<Job>;
}

interface AmapLocationPickerProps {
  value: string;
  onChange: (val: string) => void;
  onCoordsChange: (lng: number, lat: number) => void;
  error?: string;
}

// ────────────────────────────────────────────────────────────
// 高德地图辅助组件：地址选择器
// ────────────────────────────────────────────────────────────
function AmapLocationPicker({ value, onChange, onCoordsChange, error }: AmapLocationPickerProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autoCompleteRef = useRef<any>(null);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof window === "undefined" || (window as any).AMap) return;

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
      // 不建议删除脚本，因为可能其他组件也在用
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
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        工作地点 <span className="text-red-500">*</span>
      </label>
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
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
              : "border-gray-200 focus:border-brand-gold focus:ring-brand-gold"
          }`}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}

      {/* 下拉建议列表 */}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl">
          {suggestions.map((tip, index) => (
            <li
              key={index}
              onMouseDown={(e) => {
                e.preventDefault();
                // 拼接更完整的地址信息保存
                const fullLocation = tip.address && typeof tip.address === 'string' && !tip.name.includes(tip.address) 
                  ? `${tip.district}${tip.name}` 
                  : `${tip.district}${tip.name}`;
                
                onChange(fullLocation);
                if (tip.location) {
                  onCoordsChange(tip.location.lng, tip.location.lat);
                }
                setOpen(false);
              }}
              className="flex cursor-pointer flex-col px-4 py-2 hover:bg-gray-50"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                <Search className="h-3.5 w-3.5 text-gray-400" />
                {tip.name}
              </div>
              <div className="ml-5 text-xs text-gray-500">{tip.district}{tip.address || ""}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 主表单组件
// ────────────────────────────────────────────────────────────
export function JobForm({ jobId, initialData }: JobFormProps) {
  const router = useRouter();
  const { success, error: showError } = useToast();
  const isEdit = !!jobId;

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);

  const [formData, setFormData] = useState<Partial<Job>>({
    title: "",
    titleEn: "",
    location: "",
    type: "fulltime",
    salary: "",
    description: "",
    requirements: "",
    order: 0,
    published: true,
    longitude: null,
    latitude: null,
    ...initialData,
  });

  const updateField = <K extends keyof Job>(field: K, value: Job[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.title?.trim()) newErrors.title = "请输入中文职位名称";
    if (!formData.location?.trim()) newErrors.location = "请输入工作地点";
    if (!formData.description?.trim()) newErrors.description = "请输入职位描述";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // 辅助函数：提交前尝试根据文字补全坐标 (针对 POI + 高效纠合方案)
  const ensureCoordinates = async (address: string): Promise<{lng: number, lat: number} | null> => {
     return new Promise((resolve) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const AMap = (window as any).AMap;
        if (!AMap || !AMap.PlaceSearch) return resolve(null);

        // 默认上海中心坐标（高德常回落到这里，约在城隍庙/人民广场附近）
        const IS_DEFAULT_CENTER = (lng: number, lat: number) => {
           return Math.abs(lng - 121.472) < 0.05 && Math.abs(lat - 31.232) < 0.05;
        };

        // 策略1：优先用 PlaceSearch 搜具体的建筑物（针对 "信泰中心" 这种写字楼点对点最准）
        const ps = new AMap.PlaceSearch({ city: "021", pageSize: 1 });
        
        // 智能提取关键词：如果是 "上海市普陀区信泰中心广场T3-610" -> 会尝试提取 "普陀区信泰中心广场"
        const cleanKeyword = address.split(' ').shift() || address;
        const shortKeyword = cleanKeyword.split(/[A-Z,a-z,0-9]/)[0] || cleanKeyword; // 尝试剥离房号后缀

        ps.search(shortKeyword, (status: string, result: any) => {
           if (status === 'complete' && result.poiList && result.poiList.pois.length > 0) {
              const poi = result.poiList.pois[0];
              if (!IS_DEFAULT_CENTER(poi.location.lng, poi.location.lat)) {
                 return resolve({ lng: poi.location.lng, lat: poi.location.lat });
              }
           }

           // 策略2：备选 Geocoder 
           const geocoder = new AMap.Geocoder({ city: "021" });
           geocoder.getLocation(address, (s: string, r: any) => {
              if (s === 'complete' && r.geocodes.length > 0) {
                 const loc = r.geocodes[0].location;
                 if (!IS_DEFAULT_CENTER(loc.lng, loc.lat)) {
                    return resolve({ lng: loc.lng, lat: loc.lat });
                 }
              }

              // 策略3：极端兜底 - 只搜区名+大楼名关键词
              const fallbackKeyword = address.includes('区') ? address.split('区').pop()?.substring(0, 10) : address;
              geocoder.getLocation(fallbackKeyword || address, (fs: string, fr: any) => {
                 if (fs === 'complete' && fr.geocodes.length > 0) {
                    const loc = fr.geocodes[0].location;
                    resolve({ lng: loc.lng, lat: loc.lat });
                 } else {
                    resolve(null);
                 }
              });
           });
        });
     });
  };

  const doSave = async (publishedState?: boolean) => {
    setLoading(true);
    try {
      const finalData = {
        ...formData,
        published: publishedState !== undefined ? publishedState : formData.published,
      };

      // 如果没有坐标，尝试强制解析一次
      if (!finalData.longitude || !finalData.latitude) {
         const coords = await ensureCoordinates(finalData.location || "");
         if (coords) {
            finalData.longitude = coords.lng;
            finalData.latitude = coords.lat;
         }
      }

      const url = isEdit ? `/api/admin/jobs/${jobId}` : "/api/admin/jobs";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalData),
      });

      const data = res.status !== 204 ? await res.json() : {};

      if (!res.ok) {
        throw new Error(data.error?.message || "保存失败");
      }

      success(isEdit ? "职位已更新" : "职位已创建");
      router.push("/admin/jobs");
      router.refresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setLoading(false);
    }
  };

  // 提交表单
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      showError("请检查表单填写");
      return;
    }

    if (!formData.published) {
      setShowPublishConfirm(true);
      return;
    }

    await doSave();
  };

  const handleConfirmPublish = async () => {
    setShowPublishConfirm(false);
    await doSave(true);
  };

  // 暂时保留，如果未来需要保存为草稿则启用
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleKeepDraft = async () => {
    setShowPublishConfirm(false);
    await doSave(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* 基本信息 */}
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-6 text-lg font-medium text-gray-900">基本信息</h2>
        <div className="grid gap-6 md:grid-cols-2">
          <Input
            label="职位名称（中文）"
            value={formData.title}
            onChange={(e) => updateField("title", e.target.value)}
            error={errors.title}
            required
          />
          <Input
            label="职位名称（英文）"
            value={formData.titleEn || ""}
            onChange={(e) => updateField("titleEn", e.target.value)}
            error={errors.titleEn}
          />
          {/* 工作地点 — 高德地图搜索 */}
          <AmapLocationPicker
            value={formData.location || ""}
            onChange={(val: string) => updateField("location", val)}
            onCoordsChange={(lng: number, lat: number) => {
              updateField("longitude", lng);
              updateField("latitude", lat);
            }}
            error={errors.location}
          />
          <Select
            label="职位类型"
            options={JOB_TYPES}
            value={formData.type || "fulltime"}
            onChange={(e) => updateField("type", e.target.value as "fulltime" | "parttime" | "intern")}
            error={errors.type}
            required
          />
          <Input
            label="薪资范围"
            value={formData.salary || ""}
            onChange={(e) => updateField("salary", e.target.value)}
            placeholder="如：15K-25K"
          />
          <div className="flex items-end">
            <Switch
              label="发布状态"
              checked={formData.published || false}
              onChange={(checked) => updateField("published", checked)}
            />
          </div>
        </div>
        {/* 显示经纬度调试 */}
        {formData.longitude && formData.latitude && (
          <p className="mt-2 text-xs text-gray-400">
            已定位坐标: {formData.longitude.toFixed(6)}, {formData.latitude.toFixed(6)}
          </p>
        )}
      </section>

      {/* 职责描述 */}
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-6 text-lg font-medium text-gray-900">职责描述</h2>
        <RichTextEditor
          value={formData.description || ""}
          onChange={(value) => updateField("description", value)}
          error={errors.description}
          placeholder="请输入职位职责描述..."
          minHeight="200px"
        />
      </section>

      {/* 任职要求 */}
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-6 text-lg font-medium text-gray-900">任职要求</h2>
        <RichTextEditor
          value={formData.requirements || ""}
          onChange={(value) => updateField("requirements", value)}
          error={errors.requirements}
          placeholder="请输入任职要求..."
          minHeight="200px"
        />
      </section>

      {/* 排序与操作 */}
      <section className="flex items-center justify-between rounded-xl bg-white p-6 shadow-sm">
        <div className="w-32">
          <Input
            label="显示排序"
            type="number"
            value={formData.order || 0}
            onChange={(e) => updateField("order", parseInt(e.target.value) || 0)}
            placeholder="0"
          />
        </div>
        <div className="flex gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={loading}
          >
            取消
          </Button>
          <Button type="submit" loading={loading}>
            {isEdit ? "更新职位" : "创建职位"}
          </Button>
        </div>
      </section>

      {/* 发布确认弹窗 */}
      <ConfirmDialog
        open={showPublishConfirm}
        onClose={() => setShowPublishConfirm(false)}
        title="发布职位"
        description="您当前选择不立即发布此职位。您可以选择将其保存为草稿，或者立即发布。"
        confirmText="立即发布"
        cancelText="保存草稿"
        onConfirm={handleConfirmPublish}
      />
    </form>
  );
}
