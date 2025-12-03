/**
 * API 通用响应验证 Schema
 */
import { z } from "zod";

// 通用 API 成功响应 Schema
export const ApiSuccessSchema = z.object({
  success: z.literal(true),
  data: z.unknown(),
  message: z.string().optional(),
});

// 通用 API 错误响应 Schema
export const ApiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});

// 通用 API 响应 Schema
export const ApiResponseSchema = z.discriminatedUnion("success", [
  ApiSuccessSchema,
  ApiErrorSchema,
]);

// 分页参数 Schema
export const PaginationParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// 分页元数据 Schema
export const PaginationMetaSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
  hasMore: z.boolean(),
});

// 分页响应 Schema（泛型工厂函数）
export function createPaginatedResponseSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    success: z.literal(true),
    data: z.object({
      items: z.array(itemSchema),
      pagination: PaginationMetaSchema,
    }),
  });
}

// 排序参数 Schema
export const SortParamsSchema = z.object({
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// 管理员登录请求 Schema
export const AdminLoginSchema = z.object({
  email: z.string().email("请输入有效的邮箱地址"),
  password: z.string().min(6, "密码至少6个字符"),
});

// 管理员登录响应 Schema
export const AdminLoginResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    token: z.string(),
    expiresAt: z.number(),
    user: z.object({
      id: z.string(),
      email: z.string(),
      name: z.string().optional(),
    }),
  }),
});

// 文件上传响应 Schema
export const UploadResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    url: z.string().url(),
    filename: z.string(),
    size: z.number(),
    mimeType: z.string(),
  }),
});

// 批量操作请求 Schema
export const BatchOperationSchema = z.object({
  ids: z.array(z.string()).min(1, "请选择至少一项"),
  action: z.enum(["delete", "publish", "unpublish", "archive"]),
});

// 通用 ID 参数 Schema
export const IdParamSchema = z.object({
  id: z.string().min(1, "ID不能为空"),
});

// 通用 Slug 参数 Schema
export const SlugParamSchema = z.object({
  slug: z.string().min(1, "Slug不能为空"),
});

// 类型导出
export type ApiSuccess = z.infer<typeof ApiSuccessSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type ApiResponse = z.infer<typeof ApiResponseSchema>;
export type PaginationParams = z.infer<typeof PaginationParamsSchema>;
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;
export type SortParams = z.infer<typeof SortParamsSchema>;
export type AdminLoginData = z.infer<typeof AdminLoginSchema>;
export type AdminLoginResponse = z.infer<typeof AdminLoginResponseSchema>;
export type UploadResponse = z.infer<typeof UploadResponseSchema>;
export type BatchOperation = z.infer<typeof BatchOperationSchema>;
export type IdParam = z.infer<typeof IdParamSchema>;
export type SlugParam = z.infer<typeof SlugParamSchema>;
