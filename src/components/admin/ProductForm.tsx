"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Save, Send, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select, SelectOption } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { TagInput } from "@/components/ui/TagInput";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { ImageUploader } from "@/components/admin/ImageUploader";
import { useToast } from "@/components/ui/Toast";
import { ProductSchema } from "@/schemas/product";

// 图片类型
interface ImageItem {
  id?: string;
  url: string;
  alt?: string | null;
  order: number;
  file?: File;
}

// 表单数据类型
interface FormData {
  name: string;
  nameEn: string;
  slug: string;
  categoryId: string;
  price: number;
  capacity: string | null;
  purchaseUrl: string | null;
  description: string;
  ingredients: string | null;
  usage: string | null;
  benefits: string[];
  images: ImageItem[];
  order: number;
  featured: boolean;
  published: boolean;
}

// 分类类型
interface Category {
  id: string;
  name: string;
}

// 产品数据（编辑时）
interface ProductData extends FormData {
  id: string;
}

interface ProductFormProps {
  mode: "create" | "edit";
  initialData?: ProductData;
  categories: Category[];
}

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

const defaultFormData: FormData = {
  name: "",
  nameEn: "",
  slug: "",
  categoryId: "",
  price: 0,
  capacity: "",
  purchaseUrl: "",
  description: "",
  ingredients: "",
  usage: "",
  benefits: [],
  images: [],
  order: 0,
  featured: false,
  published: false,
};

export function ProductForm({ mode, initialData, categories }: ProductFormProps) {
  const router = useRouter();
  const { success, error: showError } = useToast();
  const [formData, setFormData] = useState<FormData>(initialData || defaultFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // 分类选项
  const categoryOptions: SelectOption[] = [
    { value: "", label: "请选择分类" },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  // 自动生成 slug
  useEffect(() => {
    if (mode === "create" && formData.nameEn && !formData.slug) {
      setFormData((prev) => ({
        ...prev,
        slug: generateSlug(prev.nameEn),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.nameEn, mode]);

  // 更新表单字段
  const updateField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    // 清除该字段的错误
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
      ProductSchema.parse({
        ...formData,
        purchaseUrl: formData.purchaseUrl || null,
        capacity: formData.capacity || null,
        ingredients: formData.ingredients || null,
        usage: formData.usage || null,
      });
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

  // 上传图片到服务器
  const uploadImages = async (images: ImageItem[]): Promise<ImageItem[]> => {
    const uploaded: ImageItem[] = [];
    for (const img of images) {
      if (img.file) {
        // 新上传的图片
        const formData = new FormData();
        formData.append("file", img.file);
        formData.append("folder", "products");

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          throw new Error("图片上传失败");
        }

        const data = await res.json();
        uploaded.push({
          url: data.data.url,
          alt: img.alt,
          order: img.order,
        });
      } else {
        // 已有图片
        uploaded.push({
          id: img.id,
          url: img.url,
          alt: img.alt,
          order: img.order,
        });
      }
    }
    return uploaded;
  };

  // 保存产品
  const handleSave = async (publish: boolean = false) => {
    if (!validateForm()) {
      showError("请检查表单错误");
      return;
    }

    if (publish) {
      setPublishing(true);
    } else {
      setSaving(true);
    }

    try {
      // 上传新图片
      const uploadedImages = await uploadImages(formData.images);

      const payload = {
        ...formData,
        images: uploadedImages,
        purchaseUrl: formData.purchaseUrl || null,
        capacity: formData.capacity || null,
        ingredients: formData.ingredients || null,
        usage: formData.usage || null,
        published: publish ? true : formData.published,
      };

      const url =
        mode === "create"
          ? "/api/admin/products"
          : `/api/admin/products/${initialData?.id}`;
      const method = mode === "create" ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || "保存失败");
      }

      success(publish ? "产品已发布" : "产品已保存");
      router.push("/admin/products");
      router.refresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
      setPublishing(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      {/* 顶部操作栏 */}
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          返回
        </button>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => handleSave(false)}
            loading={saving}
            leftIcon={<Save className="h-4 w-4" />}
          >
            保存草稿
          </Button>
          <Button
            onClick={() => handleSave(true)}
            loading={publishing}
            leftIcon={<Send className="h-4 w-4" />}
          >
            保存并发布
          </Button>
        </div>
      </div>

      <div className="space-y-8">
        {/* 基本信息 */}
        <section className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-medium text-gray-900">基本信息</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <Input
              label="产品名称（中文）"
              value={formData.name}
              onChange={(e) => updateField("name", e.target.value)}
              error={errors.name}
              required
            />
            <Input
              label="产品名称（英文）"
              value={formData.nameEn}
              onChange={(e) => updateField("nameEn", e.target.value)}
              error={errors.nameEn}
              required
            />
            <Input
              label="URL 别名"
              value={formData.slug}
              onChange={(e) => updateField("slug", e.target.value)}
              error={errors.slug}
              required
              placeholder="自动生成，可修改"
            />
            <Select
              label="产品分类"
              options={categoryOptions}
              value={formData.categoryId}
              onChange={(e) => updateField("categoryId", e.target.value)}
              error={errors.categoryId}
              required
            />
            <Input
              label="价格（元）"
              type="number"
              value={formData.price}
              onChange={(e) => updateField("price", Number(e.target.value))}
              error={errors.price}
              required
            />
            <Input
              label="规格容量"
              value={formData.capacity || ""}
              onChange={(e) => updateField("capacity", e.target.value)}
              error={errors.capacity}
              placeholder="如：30ml、50g"
            />
          </div>
        </section>

        {/* 产品图片 */}
        <section className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-medium text-gray-900">产品图片</h2>
          <ImageUploader
            value={formData.images}
            onChange={(images) => updateField("images", images)}
            error={errors.images}
            maxImages={10}
          />
        </section>

        {/* 产品描述 */}
        <section className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-medium text-gray-900">产品描述</h2>
          <RichTextEditor
            label="产品简介"
            value={formData.description}
            onChange={(value) => updateField("description", value)}
            error={errors.description}
            placeholder="请输入产品简介..."
            minHeight="150px"
          />
          <div className="mt-6">
            <RichTextEditor
              label="成分说明"
              value={formData.ingredients || ""}
              onChange={(value) => updateField("ingredients", value)}
              error={errors.ingredients}
              placeholder="请输入成分说明..."
              minHeight="120px"
            />
          </div>
          <div className="mt-6">
            <RichTextEditor
              label="使用方法"
              value={formData.usage || ""}
              onChange={(value) => updateField("usage", value)}
              error={errors.usage}
              placeholder="请输入使用方法..."
              minHeight="120px"
            />
          </div>
        </section>

        {/* 功效标签 */}
        <section className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-medium text-gray-900">功效标签</h2>
          <TagInput
            label="产品功效"
            value={formData.benefits}
            onChange={(tags) => updateField("benefits", tags)}
            error={errors.benefits}
            maxTags={20}
            placeholder="输入功效后按回车添加，如：保湿、抗皱"
          />
        </section>

        {/* 其他设置 */}
        <section className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-medium text-gray-900">其他设置</h2>
          <div className="space-y-4">
            <Input
              label="购买链接"
              value={formData.purchaseUrl || ""}
              onChange={(e) => updateField("purchaseUrl", e.target.value)}
              error={errors.purchaseUrl}
              placeholder="外部购买链接（可选）"
            />
            <Input
              label="排序"
              type="number"
              value={formData.order}
              onChange={(e) => updateField("order", Number(e.target.value))}
              error={errors.order}
              placeholder="数字越小越靠前"
            />
            <div className="flex flex-wrap gap-8 pt-2">
              <Switch
                label="推荐产品"
                description="在首页推荐位置展示"
                checked={formData.featured}
                onChange={(checked) => updateField("featured", checked)}
              />
              <Switch
                label="立即发布"
                description="发布后前台可见"
                checked={formData.published}
                onChange={(checked) => updateField("published", checked)}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

