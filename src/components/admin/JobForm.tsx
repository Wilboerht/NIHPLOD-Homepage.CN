"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { apiPost, apiPatch } from "@/lib/api-client";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { Switch } from "@/components/ui/Switch";
import { Button } from "@/components/ui/Button";
import { AmapLocationPicker } from "@/components/admin/AmapLocationPicker";
import { JobSchema } from "@/schemas/product";
import { z } from "zod";

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

// ────────────────────────────────────────────────────────────
// 主表单组件
// ────────────────────────────────────────────────────────────
export function JobForm({ jobId, initialData }: JobFormProps) {
  const router = useRouter();
  const { success, error: showError } = useToast();
  const isEdit = !!jobId;

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

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
    try {
      JobSchema.parse(formData);
      setErrors({});
      return true;
    } catch (err) {
      if (err instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        for (const issue of err.issues) {
          const key = String(issue.path[0] ?? "");
          if (key && !newErrors[key]) {
            newErrors[key] = issue.message;
          }
        }
        setErrors(newErrors);
      }
      return false;
    }
  };

  // 辅助函数：提交前尝试根据文字补全坐标 (针对 POI + 高效纠合方案)
  const ensureCoordinates = async (
    address: string
  ): Promise<{ lng: number; lat: number } | null> => {
    return new Promise((resolve) => {
      const amap = window.AMap;
      if (!amap || !amap.PlaceSearch) return resolve(null);

      // 默认上海中心坐标（高德常回落到这里，约在城隍庙/人民广场附近）
      const IS_DEFAULT_CENTER = (lng: number, lat: number) => {
        return Math.abs(lng - 121.472) < 0.05 && Math.abs(lat - 31.232) < 0.05;
      };

      // 策略1：优先用 PlaceSearch 搜具体的建筑物（针对 "信泰中心" 这种写字楼点对点最准）
      const ps = new amap.PlaceSearch({ city: "021", pageSize: 1 });

      // 智能提取关键词：如果是 "上海市普陀区信泰中心广场T3-610" -> 会尝试提取 "普陀区信泰中心广场"
      const cleanKeyword = address.split(" ").shift() || address;
      const shortKeyword = cleanKeyword.split(/[A-Za-z0-9]/)[0] || cleanKeyword;

      ps.search(shortKeyword, (status: string, result: AMap.PlaceSearchResult) => {
        if (status === "complete" && result.poiList && result.poiList.pois.length > 0) {
          const poi = result.poiList.pois[0];
          if (!IS_DEFAULT_CENTER(poi.location.lng, poi.location.lat)) {
            return resolve({ lng: poi.location.lng, lat: poi.location.lat });
          }
        }

        // 策略2：备选 Geocoder
        const geocoder = new amap.Geocoder({ city: "021" });
        geocoder.getLocation(address, (s: string, r: AMap.GeocoderResult) => {
          if (s === "complete" && r.geocodes.length > 0) {
            const loc = r.geocodes[0].location;
            if (!IS_DEFAULT_CENTER(loc.lng, loc.lat)) {
              return resolve({ lng: loc.lng, lat: loc.lat });
            }
          }

          // 策略3：极端兜底 - 只搜区名+大楼名关键词
          const fallbackKeyword = address.includes("区")
            ? address.split("区").pop()?.substring(0, 10)
            : address;
          geocoder.getLocation(fallbackKeyword || address, (fs: string, fr: AMap.GeocoderResult) => {
            if (fs === "complete" && fr.geocodes.length > 0) {
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

      // 如果没有坐标，尝试强制解析一次（带 10 秒超时）
      if (!finalData.longitude || !finalData.latitude) {
        const coords = await Promise.race([
          ensureCoordinates(finalData.location || ""),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error("坐标获取超时")), 10000)
          ),
        ]);
        if (coords) {
          finalData.longitude = coords.lng;
          finalData.latitude = coords.lat;
        }
      }

      if (isEdit) {
        await apiPatch(`/api/admin/jobs/${jobId}`, finalData);
      } else {
        await apiPost("/api/admin/jobs", finalData);
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

    await doSave();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* 基本信息 */}
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-6 text-lg font-medium text-brand-charcoal">基本信息</h2>
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
            onChange={(e) =>
              updateField("type", e.target.value as "fulltime" | "parttime" | "intern")
            }
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
          <p className="mt-2 text-xs text-brand-charcoal/50">
            已定位坐标: {formData.longitude.toFixed(6)}, {formData.latitude.toFixed(6)}
          </p>
        )}
      </section>

      {/* 职责描述 */}
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-6 text-lg font-medium text-brand-charcoal">职责描述</h2>
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
        <h2 className="mb-6 text-lg font-medium text-brand-charcoal">任职要求</h2>
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
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>
            取消
          </Button>
          <Button type="submit" loading={loading}>
            {isEdit ? "更新职位" : "创建职位"}
          </Button>
        </div>
      </section>
    </form>
  );
}
