"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Save, Send, ArrowLeft, Plus, Trash2, GripVertical, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select, SelectOption } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { Badge } from "@/components/ui/Badge";
import { TagInput } from "@/components/ui/TagInput";
import { ImageUploader } from "@/components/admin/ImageUploader";
import { useToast } from "@/components/ui/Toast";
import { apiPost, apiPut } from "@/lib/api-client";
import { ProductSchema } from "@/schemas/product";
import { generateSlug } from "@/lib/utils";
import { usePurchaseLinks, type PurchaseLinkItem } from "@/hooks/usePurchaseLinks";

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

// 图片类型
interface ImageItem {
  id?: string;
  url: string;
  alt?: string | null;
  order: number;
  file?: File;
}

// 购买链接类型（从 hook 复用类型）
// PurchaseLinkItem 已通过 import type 引入

// 表单数据类型
interface FormData {
  name: string;
  nameEn: string;
  slug: string;
  categoryId: string;
  price: number;
  capacity: string | null;
  origin: string | null;
  purchaseUrl: string | null;
  purchaseLinks: PurchaseLinkItem[];
  description: string;
  ingredients: string | null;
  usage: string | null;
  benefits: string[];
  images: ImageItem[];
  order: number;
  featured: boolean;
  published: boolean;
  // 站内购买
  allowDirectBuy: boolean;
  stock: number;
  geoFaqs: { question: string; answer: string }[] | null;
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

const defaultFormData: FormData = {
  name: "",
  nameEn: "",
  slug: "",
  categoryId: "",
  price: 0,
  capacity: "",
  origin: "",
  purchaseUrl: "",
  purchaseLinks: [],
  description: "",
  ingredients: "",
  usage: "",
  benefits: [],
  images: [],
  order: 0,
  featured: false,
  published: false,
  allowDirectBuy: false,
  stock: 0,
  geoFaqs: null,
};

// 购买平台选项
const platformOptions: SelectOption[] = [
  { value: "小红书", label: "小红书" },
  { value: "抖音", label: "抖音" },
  { value: "天猫", label: "天猫" },
];

export function ProductForm({ mode, initialData, categories }: ProductFormProps) {
  const router = useRouter();
  const { success, error: showError } = useToast();
  const [formData, setFormData] = useState<FormData>(() => {
    if (initialData) {
      return {
        ...defaultFormData,
        ...initialData,
        purchaseLinks: initialData.purchaseLinks || [],
      };
    }
    return defaultFormData;
  });
  const initialFormRef = useRef<FormData>(structuredClone(formData));
  const slugManuallySetRef = useRef(false);
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
    if (mode === "create" && formData.nameEn && !formData.slug && !slugManuallySetRef.current) {
      setFormData((prev) => ({
        ...prev,
        slug: generateSlug(prev.nameEn),
      }));
    }
  }, [formData.nameEn, mode, formData.slug]);

  // 未保存更改离开确认
  useEffect(() => {
    const stripBlobUrls = (data: FormData) => ({
      ...data,
      images: data.images.map((img) => ({
        ...img,
        url: img.url?.startsWith("blob:") ? "" : img.url,
        file: undefined,
      })),
    });
    const isDirty =
      JSON.stringify(stripBlobUrls(formData)) !==
      JSON.stringify(stripBlobUrls(initialFormRef.current));
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [formData]);

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

  const { addPurchaseLink, removePurchaseLink, updatePurchaseLink } = usePurchaseLinks(
    formData.purchaseLinks,
    (links) => updateField("purchaseLinks", links)
  );

  // 验证表单
  const validateForm = (): boolean => {
    try {
      ProductSchema.parse({
        ...formData,
        purchaseUrl: formData.purchaseUrl || null,
        capacity: formData.capacity || null,
        origin: formData.origin || null,
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
    for (let i = 0; i < images.length; i++) {
      const img = images[i];

      if (img.file) {
        // 新上传的图片
        const uploadFormData = new FormData();
        uploadFormData.append("file", img.file);
        uploadFormData.append("folder", "products");

        const data = await apiPost<{ url: string }>("/api/upload", uploadFormData);

        uploaded.push({
          url: data.url,
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

      // 过滤掉没有填写完整的购买链接
      const validPurchaseLinks = formData.purchaseLinks.filter((link) => link.platform && link.url);

      const payload = {
        ...formData,
        images: uploadedImages,
        purchaseLinks: validPurchaseLinks,
        purchaseUrl: formData.purchaseUrl || null,
        capacity: formData.capacity || null,
        origin: formData.origin || null,
        ingredients: formData.ingredients || null,
        usage: formData.usage || null,
        published: publish ? true : formData.published,
      };

      if (mode === "create") {
        await apiPost("/api/admin/products", payload);
      } else {
        await apiPut(`/api/admin/products/${initialData?.id}`, payload);
      }

      success(publish ? "产品已发布" : "产品已保存");
      router.push("/admin/products");
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
          className="flex items-center gap-2 text-brand-charcoal/60 hover:text-brand-charcoal"
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
          <h2 className="mb-4 text-lg font-medium text-brand-charcoal">基本信息</h2>
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
              onChange={(e) => {
                slugManuallySetRef.current = true;
                updateField("slug", e.target.value);
              }}
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
            <Input
              label="产地"
              value={formData.origin || ""}
              onChange={(e) => updateField("origin", e.target.value)}
              error={errors.origin}
              placeholder="如：摩纳哥"
            />
          </div>
        </section>

        {/* 产品图片 */}
        <section className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-medium text-brand-charcoal">产品图片</h2>
          <ImageUploader
            value={formData.images}
            onChange={(images) => updateField("images", images)}
            error={errors.images}
            maxImages={10}
          />
        </section>

        {/* 产品描述 */}
        <section className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-medium text-brand-charcoal">产品描述</h2>
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
          <h2 className="mb-4 text-lg font-medium text-brand-charcoal">功效标签</h2>
          <TagInput
            label="产品功效"
            value={formData.benefits}
            onChange={(tags) => updateField("benefits", tags)}
            error={errors.benefits}
            maxTags={20}
            placeholder="输入功效后按回车添加，如：保湿、抗皱"
          />
        </section>

        {/* 购买设置 */}
        <section className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-medium text-brand-charcoal">购买设置</h2>

          {/* 站内购买 */}
          <div className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <Badge variant="success">站内购买</Badge>
              <span className="text-xs text-brand-charcoal/50">用户可直接在网站内下单购买</span>
            </div>
            <div className="flex items-center gap-6">
              <Switch
                label="允许站内购买"
                checked={formData.allowDirectBuy}
                onChange={(checked) => updateField("allowDirectBuy", checked)}
              />
              {formData.allowDirectBuy && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-brand-charcoal/50">库存数量</span>
                  <Input
                    type="number"
                    min="0"
                    value={formData.stock}
                    onChange={(e) =>
                      updateField("stock", Math.max(0, parseInt(e.target.value) || 0))
                    }
                    className="w-24"
                  />
                </div>
              )}
            </div>
          </div>

          {/* 分隔线 */}
          <div className="mb-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-brand-charcoal/10" />
            <span className="text-xs text-brand-charcoal/50">第三方购买渠道</span>
            <div className="h-px flex-1 bg-brand-charcoal/10" />
          </div>

          {/* 第三方平台链接 */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="primary">第三方平台</Badge>
                <span className="text-xs text-brand-charcoal/50">天猫、小红书、抖音等平台链接</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addPurchaseLink}
                leftIcon={<Plus className="h-4 w-4" />}
              >
                添加平台
              </Button>
            </div>
            {formData.purchaseLinks.length === 0 ? (
              <p className="text-sm text-brand-charcoal/50">暂无第三方购买链接，点击右上角添加</p>
            ) : (
              <div className="space-y-3">
                {formData.purchaseLinks.map((link, index) => (
                  <div
                    key={`${link.platform}-${link.url}-${index}`}
                    className="flex items-center gap-3 rounded-lg border border-brand-charcoal/15 bg-brand-charcoal/[0.03] p-3"
                  >
                    <GripVertical className="h-4 w-4 flex-shrink-0 cursor-move text-brand-charcoal/50" />
                    <div className="grid flex-1 gap-3 sm:grid-cols-2">
                      <Select
                        options={platformOptions}
                        value={link.platform}
                        onChange={(e) => updatePurchaseLink(index, "platform", e.target.value)}
                        placeholder="选择平台"
                      />
                      <Input
                        value={link.url}
                        onChange={(e) => updatePurchaseLink(index, "url", e.target.value)}
                        placeholder="输入购买链接 URL"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removePurchaseLink(index)}
                      className="flex-shrink-0 rounded-full p-1.5 text-brand-charcoal/50 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {errors.purchaseLinks && (
              <p className="mt-2 text-sm text-red-500">{errors.purchaseLinks}</p>
            )}
          </div>
        </section>

        {/* GEO FAQ 设置 */}
        <section className="rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-brand-charcoal">GEO FAQ 优化 (SEO)</h2>
              <p className="mt-1 text-xs text-brand-charcoal/50">
                编写针对 AI 搜索（如 Perplexity, ChatGPT）优化的问答对，提升曝光权重
              </p>
            </div>
            {!formData.geoFaqs && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => updateField("geoFaqs", [{ question: "", answer: "" }])}
                leftIcon={<Plus className="h-4 w-4" />}
              >
                添加问答
              </Button>
            )}
          </div>

          {!formData.geoFaqs ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-brand-charcoal/20 bg-brand-charcoal/[0.03] py-8">
              <Sparkles className="mb-2 h-8 w-8 text-brand-charcoal/30" />
              <p className="text-sm text-brand-charcoal/50">尚未生成 GEO 优化内容</p>
            </div>
          ) : (
            <div className="space-y-4">
              {formData.geoFaqs.map((faq, index) => (
                <div
                  key={index}
                  className="border-brand-charcoal/8 space-y-2 rounded-lg border bg-brand-charcoal/[0.03] p-4"
                >
                  <div className="flex gap-2">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-brand-primary text-xs font-bold text-white">
                      Q
                    </span>
                    <Input
                      className="flex-1 border-none bg-transparent p-0 text-sm font-medium focus:ring-0"
                      value={faq.question}
                      onChange={(e) => {
                        const newFaqs = [...(formData.geoFaqs || [])];
                        newFaqs[index].question = e.target.value;
                        updateField("geoFaqs", newFaqs);
                      }}
                    />
                  </div>
                  <div className="flex gap-2">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-brand-charcoal text-xs font-bold text-white">
                      A
                    </span>
                    <Textarea
                      className="h-auto flex-1 resize-none border-none bg-transparent p-0 text-sm focus:ring-0"
                      rows={2}
                      value={faq.answer}
                      onChange={(e) => {
                        const newFaqs = [...(formData.geoFaqs || [])];
                        newFaqs[index].answer = e.target.value;
                        updateField("geoFaqs", newFaqs);
                      }}
                    />
                  </div>
                  <div className="mt-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        const newFaqs = formData.geoFaqs?.filter((_, i) => i !== index) || null;
                        updateField("geoFaqs", newFaqs?.length ? newFaqs : null);
                      }}
                      className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600"
                    >
                      <Trash2 className="h-3 w-3" /> 删除这组
                    </button>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  const newFaqs = [...(formData.geoFaqs || [])];
                  newFaqs.push({ question: "", answer: "" });
                  updateField("geoFaqs", newFaqs);
                }}
                leftIcon={<Plus className="h-4 w-4" />}
              >
                添加自定义问答
              </Button>
            </div>
          )}
        </section>

        {/* 其他设置 */}
        <section className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-medium text-brand-charcoal">其他设置</h2>
          <div className="space-y-4">
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
