"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Save, Send, ArrowLeft, Plus, Trash2, GripVertical, Sparkles } from "lucide-react";
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

// 购买链接类型
interface PurchaseLinkItem {
  id?: string;
  platform: string;
  url: string;
  order: number;
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

  // 购买链接管理
  const addPurchaseLink = () => {
    const newLink: PurchaseLinkItem = {
      platform: "小红书",
      url: "",
      order: formData.purchaseLinks.length,
    };
    updateField("purchaseLinks", [...formData.purchaseLinks, newLink]);
  };

  const removePurchaseLink = (index: number) => {
    const newLinks = formData.purchaseLinks.filter((_, i) => i !== index);
    // 重新排序
    updateField("purchaseLinks", newLinks.map((link, i) => ({ ...link, order: i })));
  };

  const updatePurchaseLink = (index: number, field: keyof PurchaseLinkItem, value: string | number) => {
    const newLinks = [...formData.purchaseLinks];
    newLinks[index] = { ...newLinks[index], [field]: value };
    updateField("purchaseLinks", newLinks);
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
    console.log("[DEBUG] uploadImages 开始, 图片数量:", images.length);
    const uploaded: ImageItem[] = [];
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      console.log(`[DEBUG] 处理图片 ${i + 1}:`, { hasFile: !!img.file, url: img.url, id: img.id });

      if (img.file) {
        // 新上传的图片
        console.log(`[DEBUG] 上传新图片:`, { name: img.file.name, size: img.file.size, type: img.file.type });
        const formData = new FormData();
        formData.append("file", img.file);
        formData.append("folder", "products");

        try {
          const res = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          });

          console.log(`[DEBUG] 上传响应状态:`, res.status, res.statusText);
          const data = await res.json();
          console.log(`[DEBUG] 上传响应数据:`, data);

          if (!res.ok) {
            console.error(`[DEBUG] 上传失败:`, data);
            throw new Error(data.error?.message || "图片上传失败");
          }

          uploaded.push({
            url: data.data.url,
            alt: img.alt,
            order: img.order,
          });
          console.log(`[DEBUG] 图片上传成功:`, data.data.url);
        } catch (uploadError) {
          console.error(`[DEBUG] 上传异常:`, uploadError);
          throw uploadError;
        }
      } else {
        // 已有图片
        console.log(`[DEBUG] 保留已有图片:`, img.url);
        uploaded.push({
          id: img.id,
          url: img.url,
          alt: img.alt,
          order: img.order,
        });
      }
    }
    console.log("[DEBUG] uploadImages 完成, 上传成功:", uploaded.length);
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
      const validPurchaseLinks = formData.purchaseLinks.filter(
        (link) => link.platform && link.url
      );

      const payload = {
        ...formData,
        images: uploadedImages,
        purchaseLinks: validPurchaseLinks,
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

        {/* 购买设置 */}
        <section className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-medium text-gray-900">购买设置</h2>

          {/* 站内购买 */}
          <div className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                站内购买
              </span>
              <span className="text-xs text-gray-500">用户可直接在网站内下单购买</span>
            </div>
            <div className="flex items-center gap-6">
              <Switch
                label="允许站内购买"
                checked={formData.allowDirectBuy}
                onChange={(checked) => updateField("allowDirectBuy", checked)}
              />
              {formData.allowDirectBuy && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">库存数量</span>
                  <input
                    type="number"
                    min="0"
                    value={formData.stock}
                    onChange={(e) => updateField("stock", Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-24 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold"
                  />
                </div>
              )}
            </div>
          </div>

          {/* 分隔线 */}
          <div className="mb-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400">第三方购买渠道</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          {/* 第三方平台链接 */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                  第三方平台
                </span>
                <span className="text-xs text-gray-500">天猫、小红书、抖音等平台链接</span>
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
              <p className="text-sm text-gray-500">暂无第三方购买链接，点击右上角添加</p>
            ) : (
              <div className="space-y-3">
                {formData.purchaseLinks.map((link, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3"
                  >
                    <GripVertical className="h-4 w-4 flex-shrink-0 cursor-move text-gray-400" />
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
                      className="flex-shrink-0 rounded-full p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
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
              <h2 className="text-lg font-medium text-gray-900">GEO FAQ 优化 (SEO)</h2>
              <p className="text-xs text-gray-500 mt-1">
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
            <div className="flex flex-col items-center justify-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
              <Sparkles className="h-8 w-8 text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">尚未生成 GEO 优化内容</p>
            </div>
          ) : (
            <div className="space-y-4">
              {formData.geoFaqs.map((faq, index) => (
                <div key={index} className="space-y-2 p-4 bg-gray-50 rounded-lg border border-gray-100">
                  <div className="flex gap-2">
                    <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-brand-gold text-white rounded text-xs font-bold">Q</span>
                    <input
                      className="flex-1 bg-transparent border-none p-0 text-sm font-medium focus:ring-0"
                      value={faq.question}
                      onChange={(e) => {
                        const newFaqs = [...(formData.geoFaqs || [])];
                        newFaqs[index].question = e.target.value;
                        updateField("geoFaqs", newFaqs);
                      }}
                    />
                  </div>
                  <div className="flex gap-2">
                    <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-gray-800 text-white rounded text-xs font-bold">A</span>
                    <textarea
                      className="flex-1 bg-transparent border-none p-0 text-sm h-auto focus:ring-0 resize-none"
                      rows={2}
                      value={faq.answer}
                      onChange={(e) => {
                        const newFaqs = [...(formData.geoFaqs || [])];
                        newFaqs[index].answer = e.target.value;
                        updateField("geoFaqs", newFaqs);
                      }}
                    />
                  </div>
                  <div className="flex justify-end mt-1">
                    <button 
                      type="button"
                      onClick={() => {
                        const newFaqs = formData.geoFaqs?.filter((_, i) => i !== index) || null;
                        updateField("geoFaqs", newFaqs?.length ? newFaqs : null);
                      }}
                      className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1"
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
          <h2 className="mb-4 text-lg font-medium text-gray-900">其他设置</h2>
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

