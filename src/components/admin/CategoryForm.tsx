"use client";

import { useState, useEffect, useRef } from "react";
import { z } from "zod";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cn, generateSlug } from "@/lib/utils";
import { apiPost, apiPut } from "@/lib/api-client";
import { CategorySchema as FullCategorySchema } from "@/schemas/product";

// 分类表单专用 Schema（扩展支持更多字段）
const CategorySchema = FullCategorySchema.pick({
  name: true,
  nameEn: true,
  slug: true,
  description: true,
  icon: true,
  order: true,
});

// 分类类型
interface Category {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  order: number;
  visible?: boolean;
}

interface CategoryFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  category?: Category | null;
}

export function CategoryForm({ open, onClose, onSuccess, category }: CategoryFormProps) {
  const { success, error: showError } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    nameEn: "",
    slug: "",
    description: "",
    icon: "",
    order: 0,
    visible: true,
  });
  const slugManuallySetRef = useRef(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const isEdit = !!category;

  // 初始化表单数据
  useEffect(() => {
    if (category) {
      setFormData({
        name: category.name,
        nameEn: category.nameEn,
        slug: category.slug,
        description: category.description || "",
        icon: category.icon || "",
        order: category.order ?? 0,
        visible: category.visible ?? true,
      });
    } else {
      setFormData({ name: "", nameEn: "", slug: "", description: "", icon: "", order: 0, visible: true });
    }
    setErrors({});
    slugManuallySetRef.current = false;
  }, [category, open]);

  // 自动生成 slug
  useEffect(() => {
    if (!isEdit && formData.nameEn && !formData.slug && !slugManuallySetRef.current) {
      setFormData((prev) => ({
        ...prev,
        slug: generateSlug(prev.nameEn),
      }));
    }
  }, [formData.nameEn, isEdit, formData.slug]);

  // 更新表单字段
  const updateField = (key: keyof typeof formData, value: string | number | boolean) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  // 验证表单
  const validateForm = (): boolean => {
    try {
      CategorySchema.parse(formData);
      setErrors({});
      return true;
    } catch (err) {
      if (err instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        err.issues.forEach((e) => {
          if (e.path[0]) {
            fieldErrors[String(e.path[0])] = e.message;
          }
        });
        setErrors(fieldErrors);
      }
      return false;
    }
  };

  // 保存分类
  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        await apiPut(`/api/admin/categories/${category.id}`, formData);
      } else {
        await apiPost("/api/admin/categories", formData);
      }

      success(isEdit ? "分类已更新" : "分类已创建");
      onSuccess();
      onClose();
    } catch (err) {
      showError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "编辑分类" : "新增分类"} size="md">
      <div className="space-y-4">
        <Input
          label="分类名称（中文）"
          value={formData.name}
          onChange={(e) => updateField("name", e.target.value)}
          error={errors.name}
          placeholder="e.g. Skincare Essence"
          required
        />
        <Input
          label="分类名称（英文）"
          value={formData.nameEn}
          onChange={(e) => updateField("nameEn", e.target.value)}
          error={errors.nameEn}
          placeholder="如：Essence"
          required
        />
        <Input
          label="URL 别名"
          value={formData.slug}
          onChange={(e) => {
            slugManuallySetRef.current = true;
            updateField("slug", e.target.value);
          }}
          error={errors.slug}
          placeholder="自动生成，可修改"
          required
        />
        <Textarea
          label="分类描述"
          value={formData.description}
          onChange={(e) => updateField("description", e.target.value)}
          error={errors.description}
          placeholder="简短描述分类内容"
          rows={2}
        />
        <Input
          label="排序"
          type="number"
          value={formData.order}
          onChange={(e) => updateField("order", Number(e.target.value))}
          error={errors.order}
          placeholder="数字越小越靠前"
        />
        <Textarea
          label="图标 (SVG)"
          value={formData.icon}
          onChange={(e) => updateField("icon", e.target.value)}
          error={errors.icon}
          placeholder="可选，粘贴 SVG 代码"
          rows={3}
        />

        {/* 前台展示开关 */}
        <div className="flex items-center justify-between rounded-lg border border-brand-charcoal/15 bg-brand-charcoal/[0.03] px-4 py-3">
          <div>
            <label className="text-sm font-medium text-brand-charcoal/80">前台展示</label>
            <p className="text-xs text-brand-charcoal/50">关闭后该分类不会在产品页显示</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={formData.visible}
            onClick={() => setFormData((prev) => ({ ...prev, visible: !prev.visible }))}
            className={cn(
              "relative h-6 w-11 rounded-full transition-colors",
              formData.visible ? "bg-brand-primary" : "bg-brand-charcoal/25"
            )}
          >
            <span
              className={cn(
                "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                formData.visible && "translate-x-5"
              )}
            />
          </button>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outline" onClick={onClose}>
          取消
        </Button>
        <Button onClick={handleSave} loading={saving}>
          {isEdit ? "保存" : "创建"}
        </Button>
      </div>
    </Modal>
  );
}
