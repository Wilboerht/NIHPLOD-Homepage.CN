"use client";

import { useState, useEffect, useRef } from "react";
import { z } from "zod";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { Upload, X } from "lucide-react";

// 分类类型
interface Category {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
  icon?: string | null;
  order: number;
}

interface CategoryFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  category?: Category | null;
}

// 预设图标列表 - 护肤品产品形状
const presetIcons = [
  {
    id: "face-cream",
    name: "面霜",
    svg: `<svg viewBox="0 0 24 24" fill="none"><path d="M4.71235 5.27496C5.84896 5.14222 8.00007 5 12 5C15.9999 5 18.151 5.14222 19.2876 5.27496C20.0401 5.36283 20.5 5.97852 20.5 6.73607V18C20.5 18.8284 19.8284 19.5 19 19.5H5C4.17157 19.5 3.5 18.8284 3.5 18V6.73607C3.5 5.97852 3.95992 5.36283 4.71235 5.27496Z" fill="currentColor" stroke="currentColor" stroke-width="0.8"/><path d="M5 10.25C5 10.25 6.86667 10 12 10C17.1333 10 19 10.25 19 10.25" stroke="currentColor" stroke-width="0.6" stroke-linecap="round"/></svg>`
  },
  {
    id: "scrub-cream",
    name: "磨砂膏",
    svg: `<svg viewBox="0 0 24 24" fill="none"><path d="M4.00167 7.02038C5.37524 6.86902 7.84265 6.69922 12 6.69922C16.1155 6.69922 18.5749 6.84977 19.9565 6.98565C20.8698 7.07548 21.5 7.84304 21.5 8.76077V15.6992C21.5 16.5276 20.8284 17.1992 20 17.1992H4C3.17157 17.1992 2.5 16.5276 2.5 15.6992V8.77417C2.5 7.87475 3.10766 7.1189 4.00167 7.02038Z" fill="currentColor" stroke="currentColor" stroke-width="0.8"/><path d="M4 10.9492C4 10.9492 7.27778 10.6992 12 10.6992C16.7222 10.6992 20 10.9492 20 10.9492" stroke="currentColor" stroke-width="0.6" stroke-linecap="round"/></svg>`
  },
  {
    id: "body-emulsion",
    name: "身体乳",
    svg: `<svg viewBox="0 0 24 24" fill="none"><path d="M9 1.91421C9 1.649 9.11699 1.40264 9.36653 1.31278C9.76074 1.17083 10.5387 1 12 1C13.4613 1 14.2393 1.17083 14.6335 1.31278C14.883 1.40264 15 1.649 15 1.91421V22C15 22.5523 14.5523 23 14 23H10C9.44772 23 9 22.5523 9 22V1.91421Z" fill="currentColor" stroke="currentColor" stroke-width="0.8" stroke-linejoin="round"/><path d="M10 4.9C10 4.9 10.5 4.75 12 4.75C13.5 4.75 14 4.9 14 4.9" stroke="currentColor" stroke-width="0.6" stroke-linecap="round"/><circle cx="12" cy="2.5" r="0.5" fill="currentColor" stroke="currentColor" stroke-width="0.5"/></svg>`
  },
  {
    id: "essence-lotion",
    name: "精华乳",
    svg: `<svg viewBox="0 0 24 24" fill="none"><path d="M9.84189 8.38604L10.8768 8.04105C10.9584 8.01386 11.0438 8 11.1298 8H12.8702C12.9562 8 13.0416 8.01386 13.1232 8.04105L14.1581 8.38604C14.3623 8.4541 14.5 8.64516 14.5 8.86038V21.2C14.5 21.6418 14.1418 22 13.7 22H10.3C9.85817 22 9.5 21.6418 9.5 21.2V8.86038C9.5 8.64516 9.63772 8.4541 9.84189 8.38604Z" fill="currentColor" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"/><path d="M10.25 2.27892C10.25 2.0789 10.3703 1.90047 10.5645 1.85252C10.8494 1.78218 11.3279 1.69922 12 1.69922C12.6721 1.69922 13.1506 1.78218 13.4355 1.85252C13.6297 1.90047 13.75 2.0789 13.75 2.27892V7.44922C13.75 7.72536 13.5263 7.94922 13.2501 7.94922C12.8821 7.94922 12.3814 7.94922 12 7.94922C11.6186 7.94922 11.1179 7.94922 10.7499 7.94922C10.4737 7.94922 10.25 7.72536 10.25 7.44922V2.27892Z" fill="currentColor" stroke="currentColor" stroke-width="0.7"/><path d="M10.5 9H13.5" stroke="currentColor" stroke-width="0.6" stroke-linecap="round"/></svg>`
  },
  {
    id: "sunscreen",
    name: "防晒",
    svg: `<svg viewBox="0 0 24 24" fill="none"><rect x="4.3999" y="2.10156" width="15.06" height="19.92" rx="7.2" fill="currentColor"/><path d="M6 9.5C6 9.5 7.6 9 12 9C16.4 9 18 9.5 18 9.5" stroke="currentColor" stroke-width="0.6" stroke-linecap="round"/><path d="M11.875 2C6.5 2 5.29578 5.31688 4.875 7C4.45422 8.68312 4.44498 15.2799 4.875 17C5.30502 18.7201 6.5 22 11.875 22" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 2C17.375 2 18.5792 5.31688 19 7C19.4208 8.68312 19.43 15.2799 19 17C18.57 18.7201 17.375 22 12 22" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  },
  {
    id: "hand-cream",
    name: "护手霜",
    svg: `<svg viewBox="0 0 24 24" fill="none"><path d="M14.7 3.5H9.7C9.58954 3.5 9.5 3.58954 9.5 3.7V4.4L9.95 4.85C10.3754 5.27537 10.3987 17.3615 10.3999 18.6831C10.4 18.7588 10.4428 18.8214 10.5106 18.8553L11.1894 19.1947C11.2572 19.2286 11.3 19.2979 11.3 19.3736V19.95C11.3 20.0605 11.2105 20.15 11.1 20.15H11.05C10.9395 20.15 10.85 20.2395 10.85 20.35V20.85C10.85 20.9605 10.9395 21.05 11.05 21.05H13.35C13.4605 21.05 13.55 20.9605 13.55 20.85V20.35C13.55 20.2395 13.4605 20.15 13.35 20.15H13.3C13.1895 20.15 13.1 20.0605 13.1 19.95V19.3736C13.1 19.2979 13.1428 19.2286 13.2106 19.1947L13.8894 18.8553C13.9572 18.8214 14 18.7588 14.0001 18.6831C14.0013 17.3615 14.0246 5.27537 14.45 4.85L14.7331 4.56694C14.8205 4.47955 14.9 4.2875 14.9 4.16391V3.7C14.9 3.58954 14.8105 3.5 14.7 3.5Z" fill="currentColor" stroke="currentColor" stroke-width="0.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.5708 4.5H13.8294" stroke="currentColor" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M11.269 18.5469L13.1311 18.5469" stroke="currentColor" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M11.9673 20.1406L12.4328 20.1406" stroke="currentColor" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  },
  {
    id: "facial-mask",
    name: "面膜",
    svg: `<svg viewBox="0 0 24 24" fill="none"><path d="M5.5 3.5C5.5 2.94772 5.94772 2.5 6.5 2.5H17.5C18.0523 2.5 18.5 2.94772 18.5 3.5V4.66196C18.5 4.86063 18.3648 5.0338 18.172 5.08199C17.9971 5.12571 17.9971 5.37429 18.172 5.41801C18.3648 5.4662 18.5 5.63937 18.5 5.83804V20.5C18.5 21.0523 18.0523 21.5 17.5 21.5H6.5C5.94772 21.5 5.5 21.0523 5.5 20.5V5.79666C5.5 5.6195 5.61336 5.46221 5.78144 5.40619C5.93153 5.35616 5.93153 5.14385 5.78144 5.09381C5.61336 5.03779 5.5 4.8805 5.5 4.70334V3.5Z" fill="currentColor" stroke="currentColor" stroke-width="0.8"/><path d="M7 4.4C7 4.17909 7.17909 4 7.4 4H16.6C16.8209 4 17 4.17909 17 4.4V19.1C17 19.3209 16.8209 19.5 16.6 19.5H7.4C7.17909 19.5 7 19.3209 7 19.1V4.4Z" fill="currentColor" stroke="currentColor" stroke-width="0.6" stroke-linejoin="round"/></svg>`
  },
  {
    id: "facial-cleanser",
    name: "洁面乳",
    svg: `<svg viewBox="0 0 24 24" fill="none"><path d="M9.4 3C9.4 3 9.5 2.5 12 2.5C14.5 2.5 14.6 3 14.6 3L14.75 8.5C15 8.5 15 8.83333 15 9V10.5C15.25 10.5102 15.25 10.8333 15.25 11V20.5C15.25 21.0523 14.8033 21.5 14.251 21.5H12H9.74902C9.19674 21.5 8.75 21.0527 8.75 20.5004V11C8.75 10.6 8.83333 10.5 9 10.5V9C9 8.6 9.08333 8.5 9.25 8.5L9.4 3Z" fill="currentColor" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.2067 8.49844C10.2067 8.49844 10.655 8.39844 12 8.39844C13.345 8.39844 13.7933 8.49844 13.7933 8.49844" stroke="currentColor" stroke-width="0.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.87634 10.55C9.87634 10.55 10.4073 10.5 12 10.5C13.5927 10.5 14.1237 10.55 14.1237 10.55" stroke="currentColor" stroke-width="0.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  },
  {
    id: "treatment-oil",
    name: "护理油",
    svg: `<svg viewBox="0 0 24 24" fill="none"><path d="M7.97144 11.9934C7.97144 11.782 8.04988 11.5782 8.23354 11.4734C8.65975 11.2302 9.69906 10.8438 12 10.8438C14.3009 10.8438 15.3402 11.2302 15.7664 11.4734C15.9501 11.5782 16.0285 11.782 16.0285 11.9934V20.3331C16.0285 20.8399 15.6176 21.2508 15.1108 21.2508H8.88917C8.38232 21.2508 7.97144 20.8399 7.97144 20.3331V11.9934Z" fill="currentColor" stroke="currentColor" stroke-width="0.7998" stroke-linejoin="round"/><path d="M11.2842 4.34803C11.2842 4.34803 11.4989 4.29297 12 4.29297C12.5011 4.29297 12.7158 4.34803 12.7158 4.34803" stroke="currentColor" stroke-width="0.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.14062 12.139C9.14062 12.139 9.99843 12.084 12 12.084C14.0015 12.084 14.8593 12.139 14.8593 12.139" stroke="currentColor" stroke-width="0.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.5963 3.09543C10.8518 2.96797 11.4246 2.77734 11.9973 2.77734L12 10.8167H9.76721V10.0182L9.84981 9.85305C9.84787 8.27661 9.8452 5.26204 9.84891 4.63549C9.84929 4.57273 9.87044 4.51166 9.91704 4.46962C10.0556 4.3446 10.2531 4.26463 10.483 4.23654V3.29505C10.483 3.21142 10.5215 3.13277 10.5963 3.09543Z" fill="currentColor" stroke="currentColor" stroke-width="0.7998" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.4037 3.09543C13.1482 2.96797 12.5754 2.77734 12.0027 2.77734L12 10.8167H14.2328V10.0182L14.1502 9.85305C14.1521 8.27661 14.1548 5.26204 14.1511 4.63549C14.1507 4.57273 14.1296 4.51166 14.083 4.46962C13.9444 4.3446 13.7469 4.26463 13.517 4.23654V3.29505C13.517 3.21142 13.4785 3.13277 13.4037 3.09543Z" fill="currentColor" stroke="currentColor" stroke-width="0.7998" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  },
  {
    id: "gift-box",
    name: "礼盒",
    svg: `<svg viewBox="0 0 24 24" fill="none"><path d="M19.3931 20.6893V10.252H4.60693V20.6893H19.3931Z" fill="currentColor" stroke="currentColor" stroke-width="1.73955" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.3931 20.6895H4.60693" stroke="currentColor" stroke-width="1.73955" stroke-linecap="round" stroke-linejoin="round"/><path d="M20.6978 6.77344H3.30225V10.2525H20.6978V6.77344Z" fill="currentColor" stroke="currentColor" stroke-width="1.73955" stroke-linejoin="round"/><path d="M11.737 6.13913C9.99054 5.95491 7.83731 4.17634 8.35979 3.2067C8.88227 2.23706 11.831 3.99026 11.737 6.13913Z" fill="currentColor" stroke="currentColor" stroke-width="0.62725" stroke-linecap="round"/><path d="M12.263 6.13913C14.0095 5.95491 16.1627 4.17634 15.6402 3.2067C15.1177 2.23706 12.169 3.99026 12.263 6.13913Z" fill="currentColor" stroke="currentColor" stroke-width="0.62725" stroke-linecap="round"/></svg>`
  },
];

// 分类验证 Schema
const CategorySchema = z.object({
  name: z.string().min(1, "名称不能为空").max(50, "名称不能超过50个字符"),
  nameEn: z.string().min(1, "英文名称不能为空").max(50, "英文名称不能超过50个字符"),
  slug: z
    .string()
    .min(1, "URL别名不能为空")
    .max(50, "URL别名不能超过50个字符")
    .regex(/^[a-z0-9-]+$/, "URL别名只能包含小写字母、数字和连字符"),
});

// 生成 slug
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\w\-]+/g, "")
    .replace(/--+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

export function CategoryForm({ open, onClose, onSuccess, category }: CategoryFormProps) {
  const { success, error: showError } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    name: "",
    nameEn: "",
    slug: "",
    icon: "" as string | null,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [iconMode, setIconMode] = useState<"preset" | "custom">("preset");
  const [customIconError, setCustomIconError] = useState<string | null>(null);

  const isEdit = !!category;

  // 初始化表单数据
  useEffect(() => {
    if (category) {
      setFormData({
        name: category.name,
        nameEn: category.nameEn,
        slug: category.slug,
        icon: category.icon || null,
      });
      // 判断是否为自定义图标
      const isPreset = presetIcons.some((p) => p.svg === category.icon);
      setIconMode(isPreset || !category.icon ? "preset" : "custom");
    } else {
      setFormData({ name: "", nameEn: "", slug: "", icon: null });
      setIconMode("preset");
    }
    setErrors({});
    setCustomIconError(null);
  }, [category, open]);

  // 自动生成 slug
  useEffect(() => {
    if (!isEdit && formData.nameEn && !formData.slug) {
      setFormData((prev) => ({
        ...prev,
        slug: generateSlug(prev.nameEn),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.nameEn, isEdit]);

  // 选择预设图标
  const selectIcon = (iconSvg: string) => {
    setFormData((prev) => ({
      ...prev,
      icon: prev.icon === iconSvg ? null : iconSvg,
    }));
  };

  // 处理 SVG 文件上传
  const handleSvgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 验证文件类型
    if (!file.type.includes("svg") && !file.name.endsWith(".svg")) {
      setCustomIconError("请上传 SVG 格式的文件");
      return;
    }

    // 验证文件大小 (最大 50KB)
    if (file.size > 50 * 1024) {
      setCustomIconError("SVG 文件大小不能超过 50KB");
      return;
    }

    try {
      const text = await file.text();

      // 简单验证是否为有效的 SVG
      if (!text.includes("<svg") || !text.includes("</svg>")) {
        setCustomIconError("无效的 SVG 文件");
        return;
      }

      // 清理 SVG：移除 XML 声明、DOCTYPE 等，只保留 svg 标签
      let cleanedSvg = text
        .replace(/<\?xml[^>]*\?>/gi, "")
        .replace(/<!DOCTYPE[^>]*>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .trim();

      // 确保使用 currentColor 以支持颜色变化
      // 将 fill="xxx" 替换为 fill="currentColor"（除了 none 和 transparent）
      cleanedSvg = cleanedSvg.replace(
        /fill="(?!none|transparent|currentColor)[^"]*"/gi,
        'fill="currentColor"'
      );

      setFormData((prev) => ({ ...prev, icon: cleanedSvg }));
      setCustomIconError(null);
    } catch {
      setCustomIconError("读取文件失败");
    }

    // 清空 input 以便可以重复选择同一文件
    e.target.value = "";
  };

  // 更新表单字段
  const updateField = (key: keyof typeof formData, value: string) => {
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
      const url = isEdit
        ? `/api/admin/categories/${category.id}`
        : "/api/admin/categories";
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
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "编辑分类" : "新增分类"}
      size="md"
    >
      <div className="space-y-4">
        <Input
          label="分类名称（中文）"
          value={formData.name}
          onChange={(e) => updateField("name", e.target.value)}
          error={errors.name}
          placeholder="如：护肤精华"
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
          onChange={(e) => updateField("slug", e.target.value)}
          error={errors.slug}
          placeholder="自动生成，可修改"
          required
        />

        {/* 图标选择器 */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            分类图标（用于产品页分类栏）
          </label>

          {/* 切换标签 */}
          <div className="mb-3 flex rounded-lg border border-gray-200 bg-gray-50 p-1">
            <button
              type="button"
              onClick={() => setIconMode("preset")}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                iconMode === "preset"
                  ? "bg-white text-brand-gold shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              预设图标
            </button>
            <button
              type="button"
              onClick={() => setIconMode("custom")}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                iconMode === "custom"
                  ? "bg-white text-brand-gold shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              上传自定义
            </button>
          </div>

          {/* 预设图标网格 */}
          {iconMode === "preset" && (
            <div className="grid grid-cols-5 gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
              {presetIcons.map((icon) => (
                <button
                  key={icon.id}
                  type="button"
                  onClick={() => selectIcon(icon.svg)}
                  className={cn(
                    "group relative flex flex-col items-center justify-center gap-1 rounded-lg border p-2 transition-all",
                    formData.icon === icon.svg
                      ? "border-brand-gold bg-brand-gold/10 ring-1 ring-brand-gold"
                      : "border-gray-200 bg-white hover:border-brand-gold/50 hover:bg-brand-gold/5"
                  )}
                  title={icon.name}
                >
                  <div
                    className={cn(
                      "h-8 w-8 transition-colors",
                      formData.icon === icon.svg ? "text-brand-gold" : "text-gray-500 group-hover:text-brand-gold"
                    )}
                    dangerouslySetInnerHTML={{ __html: icon.svg }}
                  />
                  <span className="text-[10px] text-gray-500">{icon.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* 自定义上传 */}
          {iconMode === "custom" && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".svg,image/svg+xml"
                className="hidden"
                onChange={handleSvgUpload}
              />

              {/* 已上传的自定义图标预览 */}
              {formData.icon && !presetIcons.some((p) => p.svg === formData.icon) ? (
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-brand-gold bg-brand-gold/10 p-2">
                    <div
                      className="h-full w-full text-brand-gold"
                      dangerouslySetInnerHTML={{ __html: formData.icon }}
                    />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-700">已上传自定义图标</p>
                    <p className="text-xs text-gray-500">点击下方按钮更换图标</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, icon: null }))}
                    className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-red-500"
                    title="删除图标"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <Upload className="mb-2 h-8 w-8 text-gray-400" />
                  <p className="text-sm text-gray-600">上传 SVG 格式的图标文件</p>
                  <p className="mt-1 text-xs text-gray-400">建议尺寸 40x40，最大 50KB</p>
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 w-full"
                leftIcon={<Upload className="h-4 w-4" />}
                onClick={() => fileInputRef.current?.click()}
              >
                {formData.icon && !presetIcons.some((p) => p.svg === formData.icon)
                  ? "更换图标"
                  : "选择 SVG 文件"}
              </Button>

              {customIconError && (
                <p className="mt-2 text-xs text-red-500">{customIconError}</p>
              )}

              <p className="mt-3 text-xs text-gray-400">
                提示：SVG 中的颜色填充会自动转换为 currentColor，以支持在产品页动态变色
              </p>
            </div>
          )}

          {formData.icon && (
            <button
              type="button"
              onClick={() => setFormData((prev) => ({ ...prev, icon: null }))}
              className="mt-2 text-xs text-gray-500 hover:text-red-500"
            >
              清除已选图标
            </button>
          )}
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

