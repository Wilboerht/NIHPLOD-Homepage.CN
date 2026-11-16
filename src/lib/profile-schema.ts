/**
 * 用户资料更新共享校验 Schema
 *
 * 主站自用 PUT /api/user/profile 与 OAuth PATCH /api/oauth/userinfo 共用，
 * 避免两处字段规则漂移。
 */
import { z } from "zod";
import { isInternalAvatarPath } from "@/lib/avatar-url";
import { checkNicknameContent, NICKNAME_REJECTED_MESSAGE } from "@/lib/nickname-policy";

// 更新参数验证
export const updateProfileSchema = z.object({
  // trim 后校验长度：纯空白昵称归一为空串（路由落库时转为 null）
  // 内容合规：本地词表 + 字符集校验（路由层会额外写审计）
  nickname: z
    .string()
    .trim()
    .max(20)
    .refine((value) => checkNicknameContent(value).ok, NICKNAME_REJECTED_MESSAGE)
    .optional(),
  // 语义校验在路由层（isAllowedAvatarUrl）：需要放行"回显未变更的存量头像"
  // （历史微信/抖音外链），因此 schema 本身只做长度与类型约束。
  avatar: z.string().trim().max(2048).optional(),
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
        z.coerce
          .date()
          .refine((d) => !Number.isNaN(d.getTime()), "无效的生日日期")
          .refine((d) => d.getTime() <= Date.now(), "生日不能晚于今天")
          .refine((d) => d.getFullYear() >= new Date().getFullYear() - 100, "生日日期超出合理范围"),
        z.literal(""),
      ])
      .optional()
  ),
  // 性别：male / female；null = 未设置/保密（默认）。不锁定，可随时自助修改
  gender: z.enum(["male", "female"]).nullable().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/**
 * 头像地址域名白名单（服务端校验）：仅允许官网域名与自有 OSS 域。
 * 资料写接口若接受任意外链，SSO 消费方（子站）会加载不可信图片
 * （追踪像素 / 混合内容），故 OAuth 资料更新入口默认拒绝白名单外的地址。
 */
const ALLOWED_AVATAR_HOSTS = (() => {
  const hosts = new Set<string>();
  const addUrl = (raw?: string) => {
    if (!raw) return;
    try {
      hosts.add(new URL(raw).host.toLowerCase());
    } catch {
      // 配置值非法时忽略（启动校验已兜底）
    }
  };
  // 官方主域始终允许，避免部署环境变量缺失/测试环境误配导致自有头像被拒。
  hosts.add("nihplod.cn");
  hosts.add("www.nihplod.cn");
  addUrl(process.env.NEXT_PUBLIC_APP_URL);
  addUrl(process.env.NEXT_PUBLIC_BASE_URL);
  addUrl(process.env.NEXT_PUBLIC_WWW_URL);
  addUrl(process.env.ALI_OSS_PUBLIC_DOMAIN);
  if (process.env.ALI_OSS_BUCKET && process.env.ALI_OSS_REGION) {
    hosts.add(
      `${process.env.ALI_OSS_BUCKET}.${process.env.ALI_OSS_REGION}.aliyuncs.com`.toLowerCase()
    );
  }
  return hosts;
})();

/**
 * 校验头像地址是否合法（仅对非空值调用）：
 * - 站内相对路径（/images/**、/uploads/**）直接放行（本地存储模式）
 * - 绝对地址仅允许 https + 官网域 / 自有 OSS 域
 */
export function isAllowedAvatarUrl(raw: string): boolean {
  if (isInternalAvatarPath(raw)) return true;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return false;
    return ALLOWED_AVATAR_HOSTS.has(url.host.toLowerCase());
  } catch {
    return false;
  }
}
