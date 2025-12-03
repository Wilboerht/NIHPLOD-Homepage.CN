/**
 * 联系表单验证 Schema
 */
import { z } from "zod";

// 联系表单 Schema
export const ContactFormSchema = z.object({
  name: z.string().min(2, "姓名至少2个字符").max(50, "姓名最多50个字符"),
  email: z.string().email("请输入有效的邮箱地址"),
  phone: z
    .string()
    .regex(/^1[3-9]\d{9}$/, "请输入有效的手机号码")
    .optional()
    .or(z.literal("")),
  content: z.string().min(10, "留言内容至少10个字符").max(1000, "留言内容最多1000个字符"),
  honeypot: z.string().max(0).optional(), // 蜜罐字段，用于防止垃圾邮件
});

// 招聘申请表单 Schema
export const JobApplicationSchema = z.object({
  name: z.string().min(2, "姓名至少2个字符").max(50, "姓名最多50个字符"),
  email: z.string().email("请输入有效的邮箱地址"),
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入有效的手机号码"),
  jobId: z.string().min(1, "请选择申请职位"),
  resume: z.string().url("请上传简历").optional(),
  coverLetter: z.string().max(2000, "求职信最多2000个字符").optional(),
  portfolio: z.string().url("请输入有效的作品集链接").optional().or(z.literal("")),
  honeypot: z.string().max(0).optional(),
});

// 留言查询参数 Schema
export const MessageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["unread", "read", "replied", "archived"]).optional(),
  type: z.enum(["contact", "job"]).optional(),
  search: z.string().max(100).optional(),
  sortBy: z.enum(["createdAt", "name", "email"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// 类型导出
export type ContactFormData = z.infer<typeof ContactFormSchema>;
export type JobApplicationData = z.infer<typeof JobApplicationSchema>;
export type MessageQueryParams = z.infer<typeof MessageQuerySchema>;
