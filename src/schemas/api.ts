/**
 * API Schema 定义
 */
import { z } from "zod";

// 管理员登录请求 Schema
export const AdminLoginSchema = z.object({
  email: z.string().email("请输入有效的邮箱地址"),
  password: z.string().min(8, "密码至少8位"),
  totpCode: z.union([z.string().length(6, "二次验证码为6位数字"), z.literal("")]).optional(),
});

// 类型导出
export type AdminLoginData = z.infer<typeof AdminLoginSchema>;
