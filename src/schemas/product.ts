/**
 * 作品相关验证 Schema
 */
import { z } from "zod";

// 产品图片 Schema
export const ProductImageSchema = z.object({
  id: z.string().optional(), // 已有图片的 ID
  url: z.string().url("请输入有效的图片URL"),
  alt: z.string().max(200, "图片描述最多200个字符").optional().nullable(),
  order: z.number().int().min(0).default(0),
});

// 产品创建/更新 Schema
export const ProductSchema = z.object({
  name: z.string().min(1, "产品名称不能为空").max(100, "产品名称不能超过100个字符"),
  nameEn: z.string().min(1, "英文名称不能为空").max(100, "英文名称不能超过100个字符"),
  slug: z
    .string()
    .min(1, "URL别名不能为空")
    .max(100, "URL别名不能超过100个字符")
    .regex(/^[a-z0-9-]+$/, "URL别名只能包含小写字母、数字和连字符"),
  categoryId: z.string().min(1, "请选择分类"),
  price: z.coerce.number().min(0, "价格不能为负数"),
  capacity: z.string().max(50, "规格容量不能超过50个字符").optional().nullable(),
  purchaseUrl: z.string().url("请输入有效的URL").optional().nullable().or(z.literal("")),
  description: z.string().min(1, "产品描述不能为空").max(5000, "描述不能超过5000个字符"),
  ingredients: z.string().max(5000, "成分说明不能超过5000个字符").optional().nullable(),
  usage: z.string().max(5000, "使用方法不能超过5000个字符").optional().nullable(),
  benefits: z.array(z.string().max(50)).max(20, "最多添加20个功效标签").optional(),
  images: z.array(ProductImageSchema).min(1, "请至少上传一张产品图片"),
  order: z.number().int().min(0).default(0),
  featured: z.boolean().default(false),
  published: z.boolean().default(false),
});

// 产品查询参数 Schema
export const ProductQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(12),
  categoryId: z.string().optional(),
  featured: z.coerce.boolean().optional(),
  published: z.coerce.boolean().optional(),
  search: z.string().max(100).optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "title", "order"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// 分类 Schema
export const CategorySchema = z.object({
  name: z.string().min(1, "名称不能为空").max(50, "名称不能超过50个字符"),
  slug: z
    .string()
    .min(1, "URL别名不能为空")
    .max(50, "URL别名不能超过50个字符")
    .regex(/^[a-z0-9-]+$/, "URL别名只能包含小写字母、数字和连字符"),
  description: z.string().max(500, "描述不能超过500个字符").optional(),
  image: z.string().url("请输入有效的图片URL").optional(),
  order: z.number().int().min(0).default(0),
});

// 类型导出
export type ProductImageData = z.infer<typeof ProductImageSchema>;
export type ProductFormData = z.infer<typeof ProductSchema>;
export type ProductQueryParams = z.infer<typeof ProductQuerySchema>;
export type CategoryFormData = z.infer<typeof CategorySchema>;
