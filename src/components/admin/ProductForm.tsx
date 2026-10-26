"use client";

import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { Save, Send, Plus, Trash2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select, SelectOption } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { TagInput } from "@/components/ui/TagInput";
import { ImageUploader } from "@/components/admin/ImageUploader";
import { FormActions } from "@/components/admin/FormActions";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { apiPost, apiPut, ApiError } from "@/lib/api-client";
import { useTotpConfirm, isTotpRequired } from "@/hooks/useTotpConfirm";
import { ProductSchema } from "@/schemas/product";
import { cn, generateSlug } from "@/lib/utils";
import { focusFirstInvalid } from "@/lib/form";
import { createPurchaseLinkKey, type PurchaseLinkItem } from "@/lib/purchase-link-form";
import {
  PURCHASE_PLATFORM_OPTIONS,
  getPurchasePlatformLabel,
  isOfficialPurchasePlatform,
  isPurchasePlatformKey,
  normalizePurchaseLink,
  resolvePurchasePlatformKey,
  type PurchasePlatformKey,
} from "@/lib/purchase-platforms";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";

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
  derivedUrls?: string[];
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
  purchaseLinks: PurchaseLinkItem[];
  description: string;
  ingredients: string | null;
  usage: string | null;
  benefits: string[];
  images: ImageItem[];
  order: number;
  published: boolean;
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
  purchaseLinks: [],
  description: "",
  ingredients: "",
  usage: "",
  benefits: [],
  images: [],
  order: 0,
  published: false,
  geoFaqs: null,
};

/** 产品表单分区：统一更紧凑的标题与内边距，避免长表单过度松散 */
function ProductFormSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("rounded-2xl border border-brand-charcoal/10 bg-white p-4 sm:p-5", className)}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-brand-charcoal">{title}</h2>
          {description && <p className="mt-1 text-xs text-brand-charcoal/65">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function getPurchaseLinkKey(link: PurchaseLinkItem): PurchasePlatformKey | null {
  return isPurchasePlatformKey(link.platformKey)
    ? link.platformKey
    : resolvePurchasePlatformKey(link.platform);
}

function getStoredPurchaseLinkKey(link: PurchaseLinkItem): PurchasePlatformKey | null {
  return isPurchasePlatformKey(link.platformKey) ? link.platformKey : null;
}

function hasPurchaseLinkContent(link: PurchaseLinkItem): boolean {
  if (getStoredPurchaseLinkKey(link)) {
    return !!(link.url.trim() || link.miniProgramShortLink?.trim() || link.miniProgramPath?.trim());
  }
  return !!(link.platform?.trim() || link.url.trim());
}

export function ProductForm({ mode, initialData, categories }: ProductFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnToParam = searchParams.get("returnTo") ?? "";
  // 只允许回到产品列表，避免开放重定向
  const returnTo = returnToParam.startsWith("/admin/products") ? returnToParam : "/admin/products";
  const { success, error: showError } = useToast();
  const { requireTotp, totpModal } = useTotpConfirm();
  const [formData, setFormData] = useState<FormData>(() => {
    if (initialData) {
      return {
        ...defaultFormData,
        ...initialData,
        purchaseLinks: (initialData.purchaseLinks || []).map((link) => {
          const platformKey = link.platformKey ?? resolvePurchasePlatformKey(link.platform);
          return {
            ...link,
            platformKey,
            platform: platformKey ? getPurchasePlatformLabel(platformKey) : link.platform,
            clientKey:
              link.clientKey ??
              (platformKey ? `canonical:${platformKey}` : createPurchaseLinkKey()),
          };
        }),
      };
    }
    return defaultFormData;
  });
  // 初始快照用 state 保存：渲染期比较脏值时不触发 react-hooks/refs 限制
  const [initialFormSnapshot] = useState<FormData>(() => structuredClone(formData));
  const slugManuallySetRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // null=空闲；"draft"/"publish"=正在执行对应动作（双按钮互斥，防并发提交）
  const [submitting, setSubmitting] = useState<null | "draft" | "publish">(null);
  // 已发布产品点"保存草稿"前的下架确认
  const [draftConfirmOpen, setDraftConfirmOpen] = useState(false);

  // 分类列表（本地状态：支持表单内快速新建分类后即建即选）
  const [categoryList, setCategoryList] = useState<Category[]>(categories);
  // 快速新建分类弹窗
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryNameEn, setNewCategoryNameEn] = useState("");
  const [newCategorySaving, setNewCategorySaving] = useState(false);
  const [newCategoryError, setNewCategoryError] = useState("");

  // 分类选项
  const categoryOptions: SelectOption[] = [
    { value: "", label: "请选择分类" },
    ...categoryList.map((c) => ({ value: c.id, label: c.name })),
  ];

  /** 快速新建分类（产品表单内联，无需跳转分类页） */
  const createCategory = async () => {
    if (!newCategoryName.trim()) {
      setNewCategoryError("请输入分类名称");
      return;
    }
    if (!newCategoryNameEn.trim()) {
      setNewCategoryError("请输入英文名称");
      return;
    }
    setNewCategorySaving(true);
    setNewCategoryError("");
    try {
      const data = await apiPost<{ id: string; name: string; nameEn: string; slug: string }>(
        "/api/admin/categories",
        {
          name: newCategoryName.trim(),
          nameEn: newCategoryNameEn.trim(),
          slug: generateSlug(newCategoryNameEn.trim()),
        }
      );
      const created: Category = { id: data.id, name: data.name };
      setCategoryList((prev) => [...prev, created]);
      updateField("categoryId", data.id);
      setNewCategoryOpen(false);
      setNewCategoryName("");
      setNewCategoryNameEn("");
      success("分类已创建并选中");
    } catch (err) {
      setNewCategoryError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setNewCategorySaving(false);
    }
  };

  // 自动生成 slug
  useEffect(() => {
    if (mode === "create" && formData.nameEn && !formData.slug && !slugManuallySetRef.current) {
      setFormData((prev) => ({
        ...prev,
        slug: generateSlug(prev.nameEn),
      }));
    }
  }, [formData.nameEn, mode, formData.slug]);

  // 未保存更改离开确认（beforeunload + 站内返回按钮）
  const isDirty = useMemo(() => {
    const stripBlobUrls = (data: FormData) => ({
      ...data,
      images: data.images.map((img) => ({
        ...img,
        url: img.url?.startsWith("blob:") ? "" : img.url,
        file: undefined,
      })),
    });
    return (
      JSON.stringify(stripBlobUrls(formData)) !== JSON.stringify(stripBlobUrls(initialFormSnapshot))
    );
  }, [formData, initialFormSnapshot]);
  const { guard: guardNavigation } = useUnsavedChanges(isDirty);
  const { can: canAdmin } = useAdminPermissions();
  const canCreateCategory = canAdmin("categories:write");

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

  const clearPurchaseLinkErrors = () => {
    setErrors((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const key of Object.keys(next)) {
        if (key === "purchaseLinks" || key.startsWith("purchaseLinks.")) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  };

  const canonicalLinkMap = useMemo(() => {
    const map = new Map<PurchasePlatformKey, { link: PurchaseLinkItem; index: number }>();
    formData.purchaseLinks.forEach((link, index) => {
      const key = getStoredPurchaseLinkKey(link);
      if (key && !map.has(key)) map.set(key, { link, index });
    });
    return map;
  }, [formData.purchaseLinks]);

  const otherPurchaseLinks = useMemo(
    () =>
      formData.purchaseLinks
        .map((link, index) => ({ link, index }))
        .filter(({ link }) => getStoredPurchaseLinkKey(link) === null),
    [formData.purchaseLinks]
  );

  const updatePurchaseLinkAt = (index: number, patch: Partial<PurchaseLinkItem>) => {
    setFormData((prev) => {
      const next = [...prev.purchaseLinks];
      if (!next[index]) return prev;
      next[index] = { ...next[index], ...patch };
      return { ...prev, purchaseLinks: next };
    });
    clearPurchaseLinkErrors();
  };

  const upsertCanonicalPurchaseLink = (
    key: PurchasePlatformKey,
    patch: Partial<PurchaseLinkItem> = {}
  ) => {
    setFormData((prev) => {
      const index = prev.purchaseLinks.findIndex((link) => getStoredPurchaseLinkKey(link) === key);
      if (index >= 0) {
        const next = [...prev.purchaseLinks];
        next[index] = { ...next[index], ...patch };
        return { ...prev, purchaseLinks: next };
      }
      const order = PURCHASE_PLATFORM_OPTIONS.findIndex((option) => option.value === key);
      return {
        ...prev,
        purchaseLinks: [
          ...prev.purchaseLinks,
          {
            platformKey: key,
            platform: getPurchasePlatformLabel(key),
            url: "",
            miniProgramShortLink: "",
            miniProgramPath: "",
            order: order >= 0 ? order : 0,
            clientKey: `canonical:${key}`,
            ...patch,
          },
        ],
      };
    });
    clearPurchaseLinkErrors();
  };

  const removeCanonicalPurchaseLink = (key: PurchasePlatformKey) => {
    setFormData((prev) => ({
      ...prev,
      purchaseLinks: prev.purchaseLinks.filter((link) => getStoredPurchaseLinkKey(link) !== key),
    }));
    clearPurchaseLinkErrors();
  };

  const addOtherPurchaseLink = () => {
    setFormData((prev) => ({
      ...prev,
      purchaseLinks: [
        ...prev.purchaseLinks,
        {
          platformKey: null,
          platform: "",
          url: "",
          order: 100 + prev.purchaseLinks.length,
          clientKey: createPurchaseLinkKey(),
        },
      ],
    }));
    clearPurchaseLinkErrors();
  };

  const removePurchaseLinkAt = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      purchaseLinks: prev.purchaseLinks.filter((_, i) => i !== index),
    }));
    clearPurchaseLinkErrors();
  };

  const updateGeoFaq = (index: number, patch: Partial<{ question: string; answer: string }>) => {
    const next = [...(formData.geoFaqs ?? [])];
    if (!next[index]) return;
    next[index] = { ...next[index], ...patch };
    updateField("geoFaqs", next);
  };

  const addGeoFaq = () => {
    updateField("geoFaqs", [...(formData.geoFaqs ?? []), { question: "", answer: "" }]);
  };

  const removeGeoFaq = (index: number) => {
    const next = (formData.geoFaqs ?? []).filter((_, i) => i !== index);
    updateField("geoFaqs", next.length ? next : null);
  };

  // 验证表单
  const validateForm = (): boolean => {
    const purchaseLinkIndexes = formData.purchaseLinks
      .map((link, index) => ({ link, index }))
      .filter(({ link }) => hasPurchaseLinkContent(link));
    try {
      ProductSchema.parse({
        ...formData,
        purchaseLinks: purchaseLinkIndexes.map(({ link }) => link),
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
          const path = e.path.map(String);
          if (path[0] === "purchaseLinks" && path[1] !== undefined) {
            const actualIndex = purchaseLinkIndexes[Number(path[1])]?.index;
            if (actualIndex === undefined) return;
            const suffix = path.slice(2).join(".");
            fieldErrors[`purchaseLinks.${actualIndex}${suffix ? `.${suffix}` : ""}`] = e.message;
            return;
          }
          if (e.path[0]) {
            fieldErrors[String(e.path[0])] = e.message;
          }
        });
        setErrors(fieldErrors);
        focusFirstInvalid(formRef.current);
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

        const data = await apiPost<{ url: string; thumbnailUrl?: string }>(
          "/api/upload",
          uploadFormData
        );

        uploaded.push({
          url: data.url,
          derivedUrls: data.thumbnailUrl ? [data.thumbnailUrl] : [],
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

  // 保存产品（publish=false 明确保存为草稿；=true 发布，两者互斥防并发提交）
  const handleSave = async (publish: boolean) => {
    if (submitting) return;
    if (!validateForm()) {
      showError("请检查表单错误");
      return;
    }

    setSubmitting(publish ? "publish" : "draft");

    try {
      // 上传新图片
      const uploadedImages = await uploadImages(formData.images);

      // 过滤掉没有填写完整的购买链接，并剥离仅前端使用的行 key
      let otherLinkOrder = 0;
      const validPurchaseLinks = formData.purchaseLinks
        .filter(hasPurchaseLinkContent)
        .map((link) => {
          const key = getPurchaseLinkKey(link);
          const normalized = normalizePurchaseLink({ ...link, platformKey: key });
          const canonicalIndex = key
            ? PURCHASE_PLATFORM_OPTIONS.findIndex((option) => option.value === key)
            : -1;
          return {
            ...normalized,
            platform: key ? getPurchasePlatformLabel(key) : normalized.platform,
            order: key ? Math.max(0, canonicalIndex) : 100 + otherLinkOrder++,
          };
        });

      const payload = {
        ...formData,
        images: uploadedImages,
        purchaseLinks: validPurchaseLinks,
        capacity: formData.capacity || null,
        origin: formData.origin || null,
        ingredients: formData.ingredients || null,
        usage: formData.usage || null,
        published: publish,
      };

      const submitProduct = () =>
        mode === "create"
          ? apiPost("/api/admin/products", payload)
          : apiPut(`/api/admin/products/${initialData?.id}`, payload);

      try {
        await submitProduct();
      } catch (error) {
        if (!isTotpRequired(error)) throw error;
        const verified = await requireTotp(error instanceof ApiError ? error.code : undefined);
        if (!verified) return;
        await submitProduct();
      }

      success(publish ? "产品已发布" : "产品已保存为草稿");
      router.push(returnTo);
    } catch (err) {
      showError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSubmitting(null);
    }
  };

  const purchaseLinkError = (index: number | undefined, field: string) =>
    index === undefined ? undefined : errors[`purchaseLinks.${index}.${field}`];
  const purchaseLinkRowError = (index: number | undefined) => {
    if (index === undefined) return undefined;
    return errors[`purchaseLinks.${index}.platformKey`] ?? errors[`purchaseLinks.${index}`];
  };

  const otherPurchasePlatformError = (value: string) => {
    if (!value.trim()) return undefined;
    if (isOfficialPurchasePlatform(value)) return "官方商城已停用";
    const key = resolvePurchasePlatformKey(value);
    return key ? `请使用上方「${getPurchasePlatformLabel(key)}」固定渠道` : undefined;
  };

  /** 已发布产品保存草稿会下架，先弹确认；未发布产品直接保存 */
  const handleSaveDraftClick = () => {
    if (initialData?.published) {
      setDraftConfirmOpen(true);
    } else {
      void handleSave(false);
    }
  };

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
      }}
      className="flex flex-col gap-5"
    >
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          {/* 基本信息 */}
          <ProductFormSection
            title="基本信息"
            description="产品名称、分类与价格等基础属性，用于前台展示和筛选"
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Select
                    label="产品分类"
                    options={categoryOptions}
                    value={formData.categoryId}
                    onChange={(e) => updateField("categoryId", e.target.value)}
                    error={errors.categoryId}
                    required
                  />
                </div>
                {canCreateCategory && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setNewCategoryError("");
                      setNewCategoryOpen(true);
                    }}
                    leftIcon={<Plus className="h-4 w-4" />}
                  >
                    新建
                  </Button>
                )}
              </div>
              <Input
                label="价格（元）"
                type="number"
                min={0}
                step="0.01"
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
              <Input
                label="列表排序"
                type="number"
                value={formData.order}
                onChange={(e) => updateField("order", Number(e.target.value))}
                error={errors.order}
                placeholder="0"
                hint="数字越小越靠前"
              />
            </div>
            <div className="mt-4 border-t border-brand-charcoal/10 pt-4">
              <TagInput
                label="功效标签"
                value={formData.benefits}
                onChange={(tags) => updateField("benefits", tags)}
                error={errors.benefits}
                maxTags={20}
                placeholder="输入功效后按回车添加，如：保湿、抗皱"
              />
            </div>
          </ProductFormSection>

          {/* 产品图片 */}
          <ProductFormSection title="产品图片" description="最多 10 张，首图将作为产品列表封面">
            <ImageUploader
              value={formData.images}
              onChange={(images) => updateField("images", images)}
              error={errors.images}
              maxImages={10}
            />
          </ProductFormSection>

          {/* 详情内容 */}
          <ProductFormSection
            title="详情内容"
            description="支持富文本编辑，前台按简介、成分说明、使用方法的顺序展示"
          >
            <div className="space-y-4">
              <RichTextEditor
                label="产品简介"
                value={formData.description}
                onChange={(value) => updateField("description", value)}
                error={errors.description}
                placeholder="请输入产品简介..."
                minHeight="150px"
              />
              <RichTextEditor
                label="成分说明"
                value={formData.ingredients || ""}
                onChange={(value) => updateField("ingredients", value)}
                error={errors.ingredients}
                placeholder="请输入成分说明..."
                minHeight="110px"
              />
              <RichTextEditor
                label="使用方法"
                value={formData.usage || ""}
                onChange={(value) => updateField("usage", value)}
                error={errors.usage}
                placeholder="请输入使用方法..."
                minHeight="110px"
              />
            </div>
          </ProductFormSection>

          {/* 购买渠道 */}
          <ProductFormSection
            title="购买渠道"
            description="网页链接用于官网展示和复制兜底；小程序短链优先用于微信内跳转；路径仅在短链不可用时使用。"
            action={<Badge variant="primary">固定四类</Badge>}
          >
            <div className="space-y-3">
              {PURCHASE_PLATFORM_OPTIONS.map((option) => {
                const entry = canonicalLinkMap.get(option.value);
                const link = entry?.link;
                const index = entry?.index;
                const rowError = purchaseLinkRowError(index);
                const configured = link ? hasPurchaseLinkContent(link) : false;
                return (
                  <div
                    key={option.value}
                    className="rounded-xl border border-brand-charcoal/10 bg-brand-charcoal/[0.02] p-3"
                  >
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[8.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
                      <div className="flex items-center justify-between gap-2 sm:col-span-2 lg:col-span-1 lg:flex-col lg:items-start lg:justify-start lg:pt-6">
                        <span className="text-sm font-medium text-brand-charcoal">
                          {option.label}
                        </span>
                        <div className="flex items-center gap-2">
                          {configured && (
                            <Badge variant="secondary" className="text-xs">
                              已配置
                            </Badge>
                          )}
                          {link && (
                            <button
                              type="button"
                              onClick={() => removeCanonicalPurchaseLink(option.value)}
                              className="flex items-center gap-1 text-xs text-brand-charcoal/65 hover:text-red-500"
                            >
                              <Trash2 className="h-3 w-3" /> 清空
                            </button>
                          )}
                        </div>
                      </div>
                      <Input
                        label="网页链接"
                        value={link?.url ?? ""}
                        onChange={(e) =>
                          upsertCanonicalPurchaseLink(option.value, { url: e.target.value })
                        }
                        error={purchaseLinkError(index, "url")}
                        placeholder="https://"
                      />
                      <Input
                        label="小程序短链"
                        value={link?.miniProgramShortLink ?? ""}
                        onChange={(e) =>
                          upsertCanonicalPurchaseLink(option.value, {
                            miniProgramShortLink: e.target.value,
                          })
                        }
                        error={purchaseLinkError(index, "miniProgramShortLink")}
                        placeholder="可选，#小程序://..."
                      />
                      <Input
                        label="小程序路径（兜底）"
                        value={link?.miniProgramPath ?? ""}
                        onChange={(e) =>
                          upsertCanonicalPurchaseLink(option.value, {
                            miniProgramPath: e.target.value,
                          })
                        }
                        error={purchaseLinkError(index, "miniProgramPath")}
                        placeholder="可选，pages/..."
                      />
                    </div>
                    {rowError && <p className="mt-2 text-sm text-red-500">{rowError}</p>}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 border-t border-brand-charcoal/10 pt-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-medium text-brand-charcoal">其他平台（保留）</h3>
                  <p className="mt-0.5 text-xs text-brand-charcoal/65">
                    仅官网展示，不进入小程序固定四类。
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addOtherPurchaseLink}
                  leftIcon={<Plus className="h-4 w-4" />}
                >
                  添加其他平台
                </Button>
              </div>
              {otherPurchaseLinks.length === 0 ? (
                <p className="rounded-lg border border-dashed border-brand-charcoal/15 px-3 py-2 text-xs text-brand-charcoal/65">
                  暂无其他平台链接
                </p>
              ) : (
                <div className="space-y-2.5">
                  {otherPurchaseLinks.map(({ link, index }) => {
                    const platformError =
                      purchaseLinkError(index, "platform") ||
                      otherPurchasePlatformError(link.platform);
                    return (
                      <div
                        key={link.clientKey ?? `purchase-link-${index}`}
                        className="grid gap-3 rounded-xl border border-brand-charcoal/10 bg-brand-charcoal/[0.02] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start"
                      >
                        <Input
                          label="平台名称"
                          value={link.platform ?? ""}
                          onChange={(e) =>
                            updatePurchaseLinkAt(index, {
                              platform: e.target.value,
                              platformKey: null,
                            })
                          }
                          error={platformError}
                          placeholder="如：京东"
                        />
                        <Input
                          label="网页链接"
                          value={link.url}
                          onChange={(e) => updatePurchaseLinkAt(index, { url: e.target.value })}
                          error={purchaseLinkError(index, "url")}
                          placeholder="https://"
                        />
                        <button
                          type="button"
                          onClick={() => removePurchaseLinkAt(index)}
                          aria-label={`删除${link.platform || "其他"}平台链接`}
                          className="justify-self-end rounded-full p-1.5 text-brand-charcoal/65 hover:bg-red-50 hover:text-red-500 sm:mt-6"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {errors.purchaseLinks && (
                <p className="mt-2 text-sm text-red-500">{errors.purchaseLinks}</p>
              )}
            </div>
          </ProductFormSection>

          {/* GEO FAQ 设置 */}
          <ProductFormSection
            title="GEO FAQ 优化"
            description="编写针对 AI 搜索（如 Perplexity、ChatGPT）优化的问答对，提升内容曝光权重"
            action={
              <div className="flex items-center gap-2">
                {formData.geoFaqs && (
                  <Badge variant="secondary">{formData.geoFaqs.length} 组</Badge>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addGeoFaq}
                  leftIcon={<Plus className="h-4 w-4" />}
                >
                  添加问答
                </Button>
              </div>
            }
          >
            {!formData.geoFaqs ? (
              <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-brand-charcoal/15 bg-brand-charcoal/[0.02] py-6 text-center">
                <Sparkles className="h-6 w-6 text-brand-charcoal/40" />
                <p className="text-sm text-brand-charcoal/65">尚未添加 GEO 问答</p>
              </div>
            ) : (
              <div className="space-y-3">
                {formData.geoFaqs.map((faq, index) => (
                  <div
                    key={index}
                    className="rounded-xl border border-brand-charcoal/10 bg-brand-charcoal/[0.02] p-3"
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-brand-primary text-xs font-bold text-white">
                        Q
                      </span>
                      <div className="min-w-0 flex-1">
                        <Input
                          aria-label={`问题 ${index + 1}`}
                          placeholder="输入问题，如：这款产品适合敏感肌吗？"
                          className="border-none bg-transparent px-1 py-0.5 text-sm font-medium focus:bg-white focus:ring-1 focus:ring-brand-primary/40"
                          value={faq.question}
                          onChange={(e) => updateGeoFaq(index, { question: e.target.value })}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeGeoFaq(index)}
                        aria-label={`删除问答 ${index + 1}`}
                        className="flex-shrink-0 rounded-full p-1.5 text-brand-charcoal/65 hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-1.5 flex items-start gap-2">
                      <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-brand-charcoal text-xs font-bold text-white">
                        A
                      </span>
                      <div className="min-w-0 flex-1">
                        <Textarea
                          aria-label={`回答 ${index + 1}`}
                          placeholder="输入简洁、可被 AI 引用的回答"
                          className="h-auto resize-none border-none bg-transparent px-1 py-0.5 text-sm focus:bg-white focus:ring-1 focus:ring-brand-primary/40"
                          rows={2}
                          value={faq.answer}
                          onChange={(e) => updateGeoFaq(index, { answer: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ProductFormSection>
        </div>

        <aside className="hidden xl:sticky xl:top-6 xl:flex xl:flex-col xl:gap-5">
          <section className="rounded-2xl border border-brand-charcoal/10 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-brand-charcoal">发布</h2>
              <Badge variant={formData.published ? "success" : "secondary"}>
                {formData.published ? "已发布" : "草稿"}
              </Badge>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-brand-charcoal/65">
              {formData.published
                ? "保存后继续对外展示；保存草稿会将产品从前台下架。"
                : "保存草稿仅后台可见；保存并发布后用户可以从前台访问。"}
            </p>
            {isDirty && <p className="mt-2 text-xs font-medium text-amber-600">有未保存的更改</p>}
            <div className="mt-3 flex flex-col gap-2">
              <Button
                type="button"
                onClick={() => void handleSave(true)}
                loading={submitting === "publish"}
                disabled={submitting !== null}
                leftIcon={<Send className="h-4 w-4" />}
                className="w-full"
              >
                保存并发布
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleSaveDraftClick}
                loading={submitting === "draft"}
                disabled={submitting !== null}
                leftIcon={<Save className="h-4 w-4" />}
                className="w-full"
              >
                保存草稿
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => guardNavigation(() => router.back())}
                disabled={submitting !== null}
                className="w-full"
              >
                取消
              </Button>
            </div>
          </section>
        </aside>
      </div>

      <FormActions
        sticky
        className="xl:hidden"
        start={
          isDirty ? (
            <span className="hidden text-xs font-medium text-amber-600 sm:inline">
              有未保存的更改
            </span>
          ) : undefined
        }
      >
        <Button
          type="button"
          variant="ghost"
          onClick={() => guardNavigation(() => router.back())}
          disabled={submitting !== null}
        >
          取消
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleSaveDraftClick}
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

      {/* 已发布产品保存草稿的下架确认 */}
      <ConfirmDialog
        open={draftConfirmOpen}
        onClose={() => setDraftConfirmOpen(false)}
        onConfirm={() => {
          setDraftConfirmOpen(false);
          void handleSave(false);
        }}
        type="warning"
        title="保存为草稿"
        description="保存草稿将把该产品从前台下架，用户将无法再访问该产品页面。确认保存为草稿？"
        confirmText="确认保存草稿"
      />

      {/* 快速新建分类弹窗（内联创建，创建后自动选中） */}
      <Modal
        open={newCategoryOpen}
        onClose={() => setNewCategoryOpen(false)}
        title="新建分类"
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label="分类名称（中文）"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="如：精华系列"
            required
          />
          <Input
            label="英文名称"
            value={newCategoryNameEn}
            onChange={(e) => setNewCategoryNameEn(e.target.value)}
            placeholder="如：Serum（URL 别名将自动生成）"
            required
          />
          {newCategoryError && <p className="text-sm text-red-500">{newCategoryError}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setNewCategoryOpen(false)}
              disabled={newCategorySaving}
            >
              取消
            </Button>
            <Button onClick={createCategory} loading={newCategorySaving}>
              创建并选中
            </Button>
          </div>
        </div>
      </Modal>
      {totpModal}
    </form>
  );
}
