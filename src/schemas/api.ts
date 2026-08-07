/**
 * API Schema 定义
 */
import { z } from "zod";
import { passwordSchema } from "@/lib/password";

// 管理员登录请求 Schema
export const AdminLoginSchema = z.object({
  email: z.string().email("请输入有效的邮箱地址"),
  password: passwordSchema,
  totpCode: z.string().min(6, "二次验证码为6位数字").max(6).regex(/^\d+$/, "二次验证码必须为数字").optional(),
});
