/**
 * 用户资料更新共享校验 Schema
 *
 * 主站自用 PUT /api/user/profile 与 OAuth PATCH /api/oauth/userinfo 共用，
 * 避免两处字段规则漂移。
 */
import { z } from "zod";

// 更新参数验证
export const updateProfileSchema = z.object({
  nickname: z.string().max(20).optional(),
  avatar: z
    .union([
      z
        .string()
        .url()
        .regex(/^https?:\/\//),
      z.literal(""),
    ])
    .optional(),
  // 生日：空字符串/null 表示清除；不得晚于今天、不早于 100 年前。
  // null 归一为 ""：z.coerce.date() 会把 null 转成 1970-01-01（new Date(null)），
  // 若不归一，客户端误传 null 会把生日静默写成 1970。
  // undefined 必须原样放行（可选字段未提交时不参与更新）：preprocess 会在
  // optional 判定之前执行，若把 undefined 也归一为 ""，gender-only 等
  // 部分更新请求会被误判为"清除生日"，触发生日锁定 403。
  birthday: z.preprocess(
    (v) => (v === null ? "" : v),
    z
      .union([
        z
          .coerce.date()
          .refine((d) => !Number.isNaN(d.getTime()), "无效的生日日期")
          .refine((d) => d.getTime() <= Date.now(), "生日不能晚于今天")
          .refine(
            (d) => d.getFullYear() >= new Date().getFullYear() - 100,
            "生日日期超出合理范围"
          ),
        z.literal(""),
      ])
      .optional()
  ),
  // 性别：male / female；null 表示清除（保密）。不锁定，可随时自助修改
  gender: z.enum(["male", "female"]).nullable().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
