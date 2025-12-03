"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { Button } from "@/components/ui/Button";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { useToast } from "@/components/ui/Toast";

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

export function JobForm({ jobId, initialData }: JobFormProps) {
  const router = useRouter();
  const { success, error: showError } = useToast();
  const isEdit = !!jobId;

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

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
    // 清除该字段的错误
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

  // 提交表单
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      showError("请检查表单填写");
      return;
    }

    setLoading(true);

    try {
      const url = isEdit ? `/api/admin/jobs/${jobId}` : "/api/admin/jobs";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
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
          <Input
            label="工作地点"
            value={formData.location}
            onChange={(e) => updateField("location", e.target.value)}
            error={errors.location}
            placeholder="如：北京"
            required
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
    </form>
  );
}

