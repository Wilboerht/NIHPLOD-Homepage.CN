/**
 * 作品相关验证 Schema
 */
import { z } from "zod";

// 产品图片 Schema
export const ProductImageSchema = z.object({
  id: z.string().optional(),
  url: z
    .string()
    .min(1, "图片URL不能为空")
    .refine((val) => {
      const v = val.trim().toLowerCase();
      return v.startsWith("/") || v.startsWith("http://") || v.startsWith("https://") || v.startsWith("blob:");
    }, "请输入有效的图片URL（支持相对路径或完整URL）"),
  alt: z.string().max(200, "图片描述最多200个字符").optional().nullable(),
  order: z.number().int().min(0).default(0),
});

// 购买链接 Schema
export const PurchaseLinkSchema = z.object({
  id: z.string().optional(), // 已有链接的 ID
  platform: z.string().min(1, "平台名称不能为空").max(50, "平台名称不能超过50个字符"),
  url: z
    .string()
    .url("请输入有效的URL")
    .refine((val) => {
      const v = val.trim().toLowerCase();
      return v.startsWith("http://") || v.startsWith("https://");
    }, "购买链接仅支持 http/https 协议"),
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
  origin: z.string().max(100, "产地不能超过100个字符").optional().nullable(),
  purchaseUrl: z.string().url().or(z.literal("")).optional().nullable(),
  purchaseLinks: z.array(PurchaseLinkSchema).optional(), // 多平台购买链接
  description: z.string().min(1, "产品描述不能为空").max(5000, "描述不能超过5000个字符"),
  ingredients: z.string().max(5000, "成分说明不能超过5000个字符").optional().nullable(),
  usage: z.string().max(5000, "使用方法不能超过5000个字符").optional().nullable(),
  benefits: z.array(z.string().min(1, "功效标签不能为空").max(50)).max(20, "最多添加20个功效标签").optional(),
  images: z.array(ProductImageSchema).min(1, "请至少上传一张产品图片"),
  order: z.number().int().min(0).default(0),
  featured: z.boolean().default(false),
  published: z.boolean().default(false),
  // 站内购买
  allowDirectBuy: z.boolean().default(false),
  stock: z.number().int().min(0, "库存不能为负数").default(0),
  // GEO FAQ 数据
  geoFaqs: z
    .array(
      z.object({
        question: z.string().min(1, "FAQ问题不能为空"),
        answer: z.string().min(1, "FAQ答案不能为空"),
      })
    )
    .optional()
    .nullable(),
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
  nameEn: z.string().min(1, "英文名称不能为空").max(50, "英文名称不能超过50个字符"),
  slug: z
    .string()
    .min(1, "URL别名不能为空")
    .max(50, "URL别名不能超过50个字符")
    .regex(/^[a-z0-9-]+$/, "URL别名只能包含小写字母、数字和连字符"),
  description: z.string().max(500, "描述不能超过500个字符").optional(),
  icon: z.string().optional().nullable(),
  image: z
    .string()
    .refine((val) => {
      if (!val) return true;
      const v = val.trim().toLowerCase();
      return v.startsWith("/") || v.startsWith("http://") || v.startsWith("https://");
    }, "请输入有效的图片URL（支持相对路径或完整URL）")
    .optional(),
  order: z.number().int().min(0).default(0),
  visible: z.boolean().default(true),
});

// 职位创建/更新 Schema
export const JobSchema = z.object({
  title: z.string().min(1, "职位名称不能为空").max(100, "职位名称不能超过100个字符"),
  titleEn: z.string().max(100, "英文名称不能超过100个字符").optional().nullable(),
  location: z.string().min(1, "工作地点不能为空").max(200, "工作地点不能超过200个字符"),
  type: z.enum(["fulltime", "parttime", "intern"], { message: "无效的职位类型" }),
  description: z.string().min(1, "职位描述不能为空").max(10000, "描述不能超过10000个字符"),
  requirements: z.string().min(1, "任职要求不能为空").max(10000, "要求不能超过10000个字符"),
  salary: z.string().max(50, "薪资范围不能超过50个字符").optional().nullable(),
  order: z.number().int().min(0, "排序值不能为负数").default(0),
  published: z.boolean().default(true),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
});
