"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { Button } from "@/components/ui/Button";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { MapPin } from "lucide-react";

// 职位类型选项
const JOB_TYPES = [
  { value: "fulltime", label: "全职" },
  { value: "parttime", label: "兼职" },
  { value: "intern", label: "实习" },
];

// 表单 Schema
const JobFormSchema = z.object({
  title: z.string().min(1, "请输入职位名称").max(100),
  titleEn: z.string().min(1, "请输入英文职位名称").max(100),
  location: z.string().min(1, "请输入工作地点").max(100),
  type: z.enum(["fulltime", "parttime", "intern"], { message: "请选择职位类型" }),
  description: z.string().min(1, "请输入职责描述"),
  requirements: z.string().min(1, "请输入任职要求"),
  salary: z.string().max(50).optional(),
  published: z.boolean(),
});

type JobFormData = z.infer<typeof JobFormSchema>;

interface JobFormProps {
  jobId?: string;
  initialData?: Partial<JobFormData>;
}

// ── 工作地点 combobox ───────────────────────────────────────
function LocationCombobox({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (val: string) => void;
  error?: string;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [allLocations, setAllLocations] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 拉取已有地点
  useEffect(() => {
    fetch("/api/admin/job-locations")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setAllLocations(d.data as string[]);
      })
      .catch(() => {});
  }, []);

  // 过滤候选项
  useEffect(() => {
    if (!value.trim()) {
      setSuggestions(allLocations);
    } else {
      setSuggestions(
        allLocations.filter((l) =>
          l.toLowerCase().includes(value.toLowerCase())
        )
      );
    }
  }, [value, allLocations]);

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
          type="text"
          value={value}
          placeholder="如：上海，或选择已有地点"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          className={`h-10 w-full rounded-lg border pl-9 pr-3 text-sm outline-none transition-colors focus:ring-1 ${
            error
              ? "border-red-400 focus:border-red-400 focus:ring-red-400"
              : "border-gray-200 focus:border-brand-gold focus:ring-brand-gold"
          }`}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}

      {/* 下拉候选列表 */}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {suggestions.map((loc) => (
            <li
              key={loc}
              onMouseDown={(e) => {
                e.preventDefault(); // 防止 blur 先于 click 触发
                onChange(loc);
                setOpen(false);
              }}
              className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-brand-gold/10 ${
                loc === value ? "bg-brand-gold/5 font-medium text-brand-gold" : "text-gray-700"
              }`}
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-brand-gold/60" />
              {loc}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
// ────────────────────────────────────────────────────────────

export function JobForm({ jobId, initialData }: JobFormProps) {
  const router = useRouter();
  const { success, error: showError } = useToast();
  const isEdit = !!jobId;

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);

  const [formData, setFormData] = useState<JobFormData>({
    title: "",
    titleEn: "",
    location: "",
    type: "fulltime",
    description: "",
    requirements: "",
    salary: "",
    published: false,
    ...initialData,
  });

  // 更新字段
  const updateField = <K extends keyof JobFormData>(key: K, value: JobFormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[key];
        return newErrors;
      });
    }
  };

  // 验证表单
  const validateForm = (): boolean => {
    try {
      JobFormSchema.parse(formData);
      setErrors({});
      return true;
    } catch (err) {
      if (err instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        err.issues.forEach((issue) => {
          const key = issue.path[0] as string;
          if (!newErrors[key]) {
            newErrors[key] = issue.message;
          }
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  // 执行保存
  const doSave = async (shouldPublish?: boolean) => {
    setLoading(true);

    try {
      const url = isEdit ? `/api/admin/jobs/${jobId}` : "/api/admin/jobs";
      const method = isEdit ? "PUT" : "POST";

      const dataToSave = shouldPublish !== undefined
        ? { ...formData, published: shouldPublish }
        : formData;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dataToSave),
      });

      const data = await res.json();

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

  const handleKeepDraft = async () => {
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
            value={formData.titleEn}
            onChange={(e) => updateField("titleEn", e.target.value)}
            error={errors.titleEn}
            required
          />
          {/* 工作地点 — combobox */}
          <LocationCombobox
            value={formData.location}
            onChange={(val) => updateField("location", val)}
            error={errors.location}
          />
          <Select
            label="职位类型"
            options={JOB_TYPES}
            value={formData.type}
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
              checked={formData.published}
              onChange={(checked) => updateField("published", checked)}
            />
          </div>
        </div>
      </section>

      {/* 职责描述 */}
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-6 text-lg font-medium text-gray-900">职责描述</h2>
        <RichTextEditor
          value={formData.description}
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
          value={formData.requirements}
          onChange={(value) => updateField("requirements", value)}
          error={errors.requirements}
          placeholder="请输入任职要求..."
          minHeight="200px"
        />
      </section>

      {/* 操作按钮 */}
      <div className="flex items-center justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/admin/jobs")}
        >
          取消
        </Button>
        <Button type="submit" loading={loading}>
          {isEdit ? "保存更改" : "创建职位"}
        </Button>
      </div>

      {/* 发布确认对话框 */}
      <ConfirmDialog
        open={showPublishConfirm}
        onClose={handleKeepDraft}
        onConfirm={handleConfirmPublish}
        title="是否发布职位？"
        description="该职位当前为草稿状态，您希望立即发布还是保持草稿？"
        type="info"
        confirmText="立即发布"
        cancelText="保持草稿"
        loading={loading}
      />
    </form>
  );
}
