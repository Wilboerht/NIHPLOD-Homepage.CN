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
  honeypot: z.string().max(0).optional(),
});

// 类型导出
export type ContactFormData = z.infer<typeof ContactFormSchema>;
