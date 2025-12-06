"use client";

import { useState, useEffect } from "react";
import { z } from "zod";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

// 选项类型
interface Option {
  value: string;
  label: string;
  labelEn?: string;
  description?: string;
  emoji?: string;
}

// 表单 Schema
const QuestionFormSchema = z.object({
  question: z.string().min(1, "请输入问题内容").max(200),
  fieldName: z.string().min(1, "请输入字段名").max(50).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "字段名只能包含字母、数字和下划线，且以字母开头"),
  type: z.enum(["single", "multiple"]),
  options: z.array(z.object({
    value: z.string().min(1, "请输入选项值"),
    label: z.string().min(1, "请输入选项标签"),
    labelEn: z.string().optional(),
    description: z.string().optional(),
    emoji: z.string().optional(),
  })).min(1, "请添加至少一个选项"),
  active: z.boolean(),
});

type QuestionFormData = z.infer<typeof QuestionFormSchema>;

interface QuestionFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  questionId?: string;
  initialData?: Partial<QuestionFormData>;
}

export function QuestionForm({
  isOpen,
  onClose,
  onSuccess,
  questionId,
  initialData,
}: QuestionFormProps) {
  const { success, error: showError } = useToast();
  const isEdit = !!questionId;

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const getDefaultFormData = (): QuestionFormData => ({
    question: "",
    fieldName: "",
    type: "single",
    options: [{ value: "", label: "", labelEn: "", description: "", emoji: "" }],
    active: true,
  });

  const [formData, setFormData] = useState<QuestionFormData>({
    ...getDefaultFormData(),
    ...initialData,
  });

  // 当 initialData 或 isOpen 变化时，重新初始化表单
  useEffect(() => {
    if (isOpen) {
      setFormData({
        ...getDefaultFormData(),
        ...initialData,
      });
      setErrors({});
    }
  }, [isOpen, initialData]);

  // 更新字段
  const updateField = <K extends keyof QuestionFormData>(key: K, value: QuestionFormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[key];
        return newErrors;
      });
    }
  };

  // 添加选项
  const addOption = () => {
    setFormData((prev) => ({
      ...prev,
      options: [...prev.options, { value: "", label: "", labelEn: "", description: "", emoji: "" }],
    }));
  };

  // 删除选项
  const removeOption = (index: number) => {
    if (formData.options.length <= 1) return;
    setFormData((prev) => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index),
    }));
  };

  // 更新选项
  const updateOption = (index: number, field: keyof Option, value: string) => {
    setFormData((prev) => ({
      ...prev,
      options: prev.options.map((opt, i) =>
        i === index ? { ...opt, [field]: value } : opt
      ),
    }));
  };

  // 验证表单
  const validateForm = (): boolean => {
    try {
      QuestionFormSchema.parse(formData);
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
      const url = isEdit
        ? `/api/admin/advisor/questions/${questionId}`
        : "/api/admin/advisor/questions";
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

      success(isEdit ? "问题已更新" : "问题已创建");
      onSuccess();
      onClose();
    } catch (err) {
      showError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setLoading(false);
    }
  };

  // 重置表单
  const handleClose = () => {
    setFormData(getDefaultFormData());
    setErrors({});
    onClose();
  };

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title={isEdit ? "编辑问题" : "新增问题"}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 基本信息 */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Input
              label="问题内容"
              value={formData.question}
              onChange={(e) => updateField("question", e.target.value)}
              error={errors.question}
              placeholder="如：您的肤质是？"
              required
            />
          </div>
          <Input
            label="字段名"
            value={formData.fieldName}
            onChange={(e) => updateField("fieldName", e.target.value)}
            error={errors.fieldName}
            placeholder="如：skinType"
            disabled={isEdit}
            required
          />
          <Select
            label="选择类型"
            options={[
              { value: "single", label: "单选" },
              { value: "multiple", label: "多选" },
            ]}
            value={formData.type}
            onChange={(e) => updateField("type", e.target.value as "single" | "multiple")}
            required
          />
        </div>

        {/* 选项列表 */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">选项列表</label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={addOption}
            >
              添加选项
            </Button>
          </div>
          {errors.options && (
            <p className="mb-2 text-sm text-red-500">{errors.options}</p>
          )}
          <div className="space-y-2">
            {formData.options.map((option, index) => (
              <div
                key={index}
                className="rounded-lg border border-gray-200 bg-gray-50 p-3"
              >
                <div className="flex items-center gap-2">
                  {/* 拖拽 */}
                  <div className="cursor-move text-gray-400">
                    <GripVertical className="h-4 w-4" />
                  </div>

                  {/* Emoji */}
                  <Input
                    placeholder="😀"
                    value={option.emoji || ""}
                    onChange={(e) => updateOption(index, "emoji", e.target.value)}
                    className="w-12 shrink-0 text-center"
                  />

                  {/* 选项值 */}
                  <Input
                    placeholder="值"
                    value={option.value}
                    onChange={(e) => updateOption(index, "value", e.target.value)}
                    className="w-24 shrink-0"
                  />

                  {/* 中文标签 */}
                  <Input
                    placeholder="中文标签"
                    value={option.label}
                    onChange={(e) => updateOption(index, "label", e.target.value)}
                    className="min-w-0 flex-1"
                  />

                  {/* 描述 */}
                  <Input
                    placeholder="描述"
                    value={option.description || ""}
                    onChange={(e) => updateOption(index, "description", e.target.value)}
                    className="min-w-0 flex-1"
                  />

                  {/* 删除 */}
                  <button
                    type="button"
                    onClick={() => removeOption(index)}
                    disabled={formData.options.length <= 1}
                    className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 启用状态 */}
        <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
          <div>
            <p className="font-medium text-gray-900">启用问题</p>
            <p className="text-sm text-gray-500">关闭后该问题不会在问卷中显示</p>
          </div>
          <Switch
            checked={formData.active}
            onChange={(checked) => updateField("active", checked)}
          />
        </div>

        {/* 操作按钮 */}
        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
          <Button type="button" variant="outline" onClick={handleClose}>
            取消
          </Button>
          <Button type="submit" loading={loading}>
            {isEdit ? "保存更改" : "创建问题"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

