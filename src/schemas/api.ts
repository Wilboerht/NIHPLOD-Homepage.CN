/**
 * API Schema 定义
 */
import { z } from "zod";

// 管理员登录请求 Schema
export const AdminLoginSchema = z.object({
  email: z.string().email("请输入有效的邮箱地址"),
  password: z.string().min(6, "密码至少6个字符"),
});

// 类型导出
export type AdminLoginData = z.infer<typeof AdminLoginSchema>;
