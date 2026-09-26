/**
 * API Schema 定义
 */
import { z } from "zod";

// 管理员登录请求 Schema
export const AdminLoginSchema = z.object({
  email: z.string().email("请输入有效的邮箱地址"),
  // 登录只校验非空：密码强度规则（passwordSchema）仅用于创建/修改密码，
  // 否则弱密码会在登录口被 400 拦截，既不记录失败也不计入锁定。
  password: z.string().min(1, "请输入密码"),
  // 兼容 6 位 TOTP 动态码与 6-20 位字母数字备用码（备用码为 16 位 hex）
  totpCode: z
    .string()
    .trim()
    .min(6, "验证码至少 6 位")
    .max(20, "验证码过长")
    .regex(/^[0-9A-Za-z]+$/, "验证码只能包含字母和数字")
    .optional(),
});
