/**
 * 消费补录业务常量与展示文案（客户端安全，无服务端依赖）
 * 用户端组件 / 管理端页面 / 服务端 lib 共用，避免散落的渠道与状态文案判断。
 */
import type { SpentAdjustmentChannel, SpentAdjustmentStatus } from "@/generated/prisma/client";

// 业务常量
export const MAX_PENDING_PER_USER = 2; // 同一用户同时最多待审申请数
export const MAX_CLAIMED_AMOUNT = 1_000_000; // 单笔申报金额上限（元）
export const MAX_REVIEW_AMOUNT = 1_000_000; // 单笔核实金额上限（元，防误操作）
export const MAX_IMAGES = 3; // 凭证截图上限
export const MAX_ORDER_NO_LENGTH = 64;
export const MAX_DEALER_NAME_LENGTH = 50; // 经销商名称长度上限

// 渠道展示文案（用户端与管理端共用；含历史渠道，存量数据可正常展示）
export const SPENT_CHANNEL_LABELS: Record<SpentAdjustmentChannel, string> = {
  TMALL: "天猫国际",
  DOUYIN: "抖音商城",
  XIAOHONGSHU: "小红书",
  WECHAT_SHOP: "微信小铺",
  OFFLINE: "线下专柜",
  DEALER: "经销渠道",
  OTHER: "其它",
  // 历史渠道（仅存量数据展示，不再开放提交）
  JD: "京东",
  MINIPROGRAM: "微信小程序",
};

// 提交渠道白名单（用户表单 / 提交接口校验，按业务顺序）
export const SPENT_CHANNELS = [
  "TMALL",
  "DOUYIN",
  "XIAOHONGSHU",
  "WECHAT_SHOP",
  "OFFLINE",
  "DEALER",
  "OTHER",
] as const satisfies readonly SpentAdjustmentChannel[];

// 历史渠道（存量数据展示 / Excel 导入解析兼容，不在用户表单中展示）
export const LEGACY_SPENT_CHANNELS = [
  "JD",
  "MINIPROGRAM",
] as const satisfies readonly SpentAdjustmentChannel[];

/** 全部渠道（含历史渠道）：展示文案映射与 Excel 导入解析使用 */
export const ALL_SPENT_CHANNELS: readonly SpentAdjustmentChannel[] = [
  ...SPENT_CHANNELS,
  ...LEGACY_SPENT_CHANNELS,
];

export const SPENT_STATUS_LABELS: Record<SpentAdjustmentStatus, string> = {
  PENDING: "待审核",
  APPROVED: "已通过",
  REJECTED: "已驳回",
};

// 提交来源展示文案（用户端只展示“客服代填”，不暴露具体管理员）
export const SPENT_SOURCE_LABELS = {
  USER: "用户提交",
  ADMIN: "客服代填",
} as const;

/**
 * 凭证图片取值规则：
 * - 以 http(s):// 或 / 开头的值是公开可直接访问的 URL（OSS 公开 / 本地存储）；
 * - 其余值视为私有 bucket 的 objectName，需经鉴权签名端点访问。
 */
export function isDirectImageUrl(value: string): boolean {
  // 只允许站内相对路径；拒绝 https:// 外链和协议相对 //（浏览器会当作跨站 URL）。
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\");
}

/**
 * 当前生产使用本地私有存储，新提交接受：
 * - private-local:spent-adjustments/<userId>/<uuid>.webp
 * - private-oss:spent-adjustments/<userId>/<uuid>.webp（未来启用私有 OSS 时）
 *
 * 历史公开 /uploads/... 与无 userId 前缀的 OSS key 不再接受新提交；
 * 存量数据由迁移/清理脚本处理。
 */
const SPENT_PROOF_KEY_PATTERN =
  /^private-(?:local|oss):spent-adjustments\/[A-Za-z0-9_-]{1,64}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/i;

/**
 * 凭证图片引用格式校验（提交入口使用）。
 * 归属由 createSpentApplication 按 userId 再做一次前缀校验。
 */
export function isValidSpentProofImageRef(value: string): boolean {
  if (value.includes("..") || value.includes("\\")) return false;
  return SPENT_PROOF_KEY_PATTERN.test(value);
}

/** 当前用户是否拥有该私有凭证 key（提交入口二次校验） */
export function isOwnedSpentProofImageRef(value: string, userId: string): boolean {
  if (!isValidSpentProofImageRef(value)) return false;
  return (
    value.startsWith(`private-local:spent-adjustments/${userId}/`) ||
    value.startsWith(`private-oss:spent-adjustments/${userId}/`)
  );
}

/**
 * 计算凭证图片的展示地址（客户端使用）
 * @param scope user=用户端（校验归属），admin=管理端（管理员登录态）
 */
export function receiptImageSrc(value: string, scope: "user" | "admin"): string {
  if (isDirectImageUrl(value)) return value;
  const endpoint =
    scope === "admin" ? "/api/admin/spent-adjustments/image" : "/api/user/spent-adjustments/image";
  return `${endpoint}?key=${encodeURIComponent(value)}`;
}
