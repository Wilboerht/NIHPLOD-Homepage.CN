"use client";

import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Save, Send } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { apiPost, apiPatch } from "@/lib/api-client";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { AmapLocationPicker } from "@/components/admin/AmapLocationPicker";
import { FormActions } from "@/components/admin/FormActions";
import { FormSection } from "@/components/admin/FormSection";
import { JobSchema } from "@/schemas/product";
import { focusFirstInvalid } from "@/lib/form";
import { z } from "zod";

// 懒加载 tiptap 富文本编辑器，避免编辑器重依赖直接进入表单页首屏 chunk
const RichTextEditor = dynamic(
  () => import("@/components/ui/RichTextEditor").then((m) => m.RichTextEditor),
  {
    ssr: false,
    loading: () => (
      <div className="h-[260px] animate-pulse rounded-lg bg-stone-200/50" aria-hidden />
    ),
  }
);

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
  const searchParams = useSearchParams();
  const returnToParam = searchParams.get("returnTo") ?? "";
  const returnTo = returnToParam.startsWith("/admin/jobs") ? returnToParam : "/admin/jobs";
  const { success, error: showError } = useToast();
  const isEdit = !!jobId;

  // null=空闲；"draft"/"publish"=正在执行对应动作（双按钮互斥，防并发提交）
  const [submitting, setSubmitting] = useState<null | "draft" | "publish">(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);

  const [formData, setFormData] = useState<Partial<Job>>({
    title: "",
    titleEn: "",
    location: "",
    type: "fulltime",
    salary: "",
    description: "",
    requirements: "",
    order: undefined,
    published: true,
    longitude: null,
    latitude: null,
    ...initialData,
  });
  // 初始快照（state 而非 ref，便于渲染期计算脏值）
  const [initialSnapshot] = useState(() => JSON.stringify(formData));
  const isDirty = useMemo(
    () => JSON.stringify(formData) !== initialSnapshot,
    [formData, initialSnapshot]
  );
  const { guard: guardNavigation } = useUnsavedChanges(isDirty);

  const updateField = <K extends keyof Job>(field: K, value: Job[K] | undefined) => {
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
        focusFirstInvalid(formRef.current);
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
          geocoder.getLocation(
            fallbackKeyword || address,
            (fs: string, fr: AMap.GeocoderResult) => {
              if (fs === "complete" && fr.geocodes.length > 0) {
                const loc = fr.geocodes[0].location;
                resolve({ lng: loc.lng, lat: loc.lat });
              } else {
                resolve(null);
              }
            }
          );
        });
      });
    });
  };

  // 保存职位（publish=false 明确保存为草稿；=true 发布，两者互斥防并发提交）
  const doSave = async (publish: boolean) => {
    setSubmitting(publish ? "publish" : "draft");
    try {
      const finalData = {
        ...formData,
        published: publish,
      };

      // 如果没有坐标，尝试自动解析一次（带 10 秒超时）。
      // 坐标为选填：解析失败/超时只跳过，不阻断保存。
      let coordsTimer: ReturnType<typeof setTimeout> | undefined;
      if (finalData.longitude == null || finalData.latitude == null) {
        try {
          const coords = await Promise.race([
            ensureCoordinates(finalData.location || ""),
            new Promise<null>((_, reject) => {
              coordsTimer = setTimeout(() => reject(new Error("坐标获取超时")), 10000);
            }),
          ]);
          if (coords) {
            finalData.longitude = coords.lng;
            finalData.latitude = coords.lat;
          }
        } catch {
          // 高德不可用或超时：保留空坐标继续保存
        } finally {
          if (coordsTimer) clearTimeout(coordsTimer);
        }
      }

      if (isEdit) {
        await apiPatch(`/api/admin/jobs/${jobId}`, finalData);
      } else {
        await apiPost("/api/admin/jobs", finalData);
      }

      success(publish ? (isEdit ? "职位已发布" : "职位已创建并发布") : "职位已保存为草稿");
      router.push(returnTo);
      router.refresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSubmitting(null);
    }
  };

  const handleSave = async (publish: boolean) => {
    if (submitting) return;
    if (!validateForm()) {
      showError("请检查表单填写");
      return;
    }
    await doSave(publish);
  };

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
      }}
      className="space-y-6"
    >
      {/* 基本信息 */}
      <FormSection title="基本信息">
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
            onCoordsChange={(lng: number | null, lat: number | null) => {
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
          {/* 坐标不开放手动录入：由上方高德选址/地址自动解析写入 */}
        </div>
      </FormSection>

      {/* 职责描述 */}
      <FormSection title="职责描述">
        <RichTextEditor
          value={formData.description || ""}
          onChange={(value) => updateField("description", value)}
          error={errors.description}
          placeholder="请输入职位职责描述..."
          minHeight="200px"
        />
      </FormSection>

      {/* 任职要求 */}
      <FormSection title="任职要求">
        <RichTextEditor
          value={formData.requirements || ""}
          onChange={(value) => updateField("requirements", value)}
          error={errors.requirements}
          placeholder="请输入任职要求..."
          minHeight="200px"
        />
      </FormSection>

      {/* 其他设置 */}
      <FormSection title="其他设置">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="显示排序"
            type="number"
            value={formData.order ?? ""}
            onChange={(e) =>
              updateField("order", e.target.value === "" ? undefined : parseInt(e.target.value))
            }
            placeholder="留空追加到末尾"
            hint="数字越小越靠前；留空自动追加到末尾"
          />
          {/* 发布状态由底部「保存草稿 / 保存并发布」按钮显式决定，避免开关与按钮语义冲突 */}
          {isEdit && (
            <p className="self-end pb-2 text-xs text-brand-charcoal/50">
              {formData.published
                ? "当前状态：已发布（点击「保存草稿」将转为未发布）"
                : "当前状态：草稿（点击「保存并发布」将上线）"}
            </p>
          )}
        </div>
      </FormSection>

      <FormActions>
        <Button
          type="button"
          variant="outline"
          onClick={() => guardNavigation(() => router.back())}
          disabled={submitting !== null}
        >
          取消
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void handleSave(false)}
          loading={submitting === "draft"}
          disabled={submitting !== null}
          leftIcon={<Save className="h-4 w-4" />}
        >
          保存草稿
        </Button>
        <Button
          type="button"
          onClick={() => void handleSave(true)}
          loading={submitting === "publish"}
          disabled={submitting !== null}
          leftIcon={<Send className="h-4 w-4" />}
        >
          保存并发布
        </Button>
      </FormActions>
    </form>
  );
}
