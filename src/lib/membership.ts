/**
 * 会员等级共享元信息
 * 用户端 / 管理端统一引用，避免散落的等级文案判断
 *
 * 等级体系（2026-09 四档）：
 * - 非会员 GUEST：未注册用户（仅展示概念，不入库）
 * - 普通会员 REGULAR：完成注册
 * - 银卡会员 SILVER：官方店铺累计消费满 ¥1,000
 * - 金卡会员 GOLD：累计消费满 ¥5,000
 * - 钻石卡会员 DIAMOND：累计消费满 ¥10,000
 *
 * 等级永久有效、按累计消费实时判定（可升可降）；
 * 权益跟随当前等级，肌肤档案数据终身保留。
 */
import type { MembershipLevel } from "@/generated/prisma/client";

export interface LevelMeta {
  label: string;
}

export const LEVEL_META: Record<MembershipLevel, LevelMeta> = {
  REGULAR: { label: "普通会员" },
  SILVER: { label: "银卡会员" },
  GOLD: { label: "金卡会员" },
  DIAMOND: { label: "钻石卡会员" },
};

/** 非会员（未注册）仅展示用 */
export const GUEST_META: LevelMeta = { label: "非会员" };

export function levelMeta(level: string | null | undefined): LevelMeta {
  if (!level) return GUEST_META;
  return LEVEL_META[level as MembershipLevel] ?? GUEST_META;
}

/** 等级展示文案，如 "金卡会员" */
export function levelDisplay(level: string | null | undefined): string {
  return levelMeta(level).label;
}

// ============================================
// 积分规则（所有等级累积积分；兑礼仅银卡及以上，账本在官网，兑礼在商城）
// ============================================

/** 积分兑礼率（1 积分可兑价值）：普通档不开放兑礼（null），仅累积积分 */
export const POINT_REDEEM_RATES: Record<MembershipLevel, number | null> = {
  REGULAR: null,
  SILVER: 1,
  GOLD: 1.3,
  DIAMOND: 1.5,
};

/** 生日积分（每年一次，按生日当天当前等级发放） */
export const BIRTHDAY_POINTS: Record<MembershipLevel, number> = {
  REGULAR: 0,
  SILVER: 50,
  GOLD: 100,
  DIAMOND: 200,
};

// ============================================
// 等级权益默认配置（数据库未配置时的 fallback，用户端与管理端共用）
// ============================================

export interface LevelBenefitItem {
  icon: string;
  title: string;
  desc: string;
}

export interface LevelDefaultBenefit {
  level: MembershipLevel;
  name: string;
  nameEn: string;
  icon: string;
  minSpent: number;
  maxSpent: number | null;
  benefits: LevelBenefitItem[];
  colorClass: string;
}

export const LEVEL_DEFAULT_BENEFITS: Record<MembershipLevel, LevelDefaultBenefit> = {
  REGULAR: {
    level: "REGULAR",
    name: "普通会员",
    nameEn: "Regular",
    icon: "",
    minSpent: 0,
    maxSpent: 999,
    benefits: [
      { icon: "", title: "测肤体验", desc: "注册即享 10 次 AI 测肤体验机会" },
      { icon: "", title: "消费积分", desc: "消费 1 元 = 1 积分，升级银卡会员解锁积分兑礼" },
      { icon: "", title: "会员升级", desc: "官方店铺累计消费满 ¥1,000 升级银卡会员" },
    ],
    colorClass: "text-slate-400",
  },
  SILVER: {
    level: "SILVER",
    name: "银卡会员",
    nameEn: "Silver",
    icon: "",
    minSpent: 1000,
    maxSpent: 4999,
    benefits: [
      { icon: "", title: "测肤加赠", desc: "每满 ¥1,000 加 20 次测肤（银卡档有效）" },
      { icon: "", title: "档案永久保留", desc: "肌肤档案终身保留" },
      { icon: "", title: "专属 AI 护肤顾问", desc: "提供专属 AI 护肤顾问服务" },
      { icon: "", title: "积分兑礼", desc: "消费 1 元 = 1 积分，兑礼 1:1" },
      { icon: "", title: "生日礼遇", desc: "生日当月赠 50 积分" },
    ],
    colorClass: "text-stone-500",
  },
  GOLD: {
    level: "GOLD",
    name: "金卡会员",
    nameEn: "Gold",
    icon: "",
    minSpent: 5000,
    maxSpent: 9999,
    benefits: [
      { icon: "", title: "不限次测肤", desc: "测肤次数不限，每日上限 10 次" },
      { icon: "", title: "档案永久保留", desc: "肌肤档案终身保留" },
      { icon: "", title: "专属 AI 护肤顾问", desc: "提供专属 AI 护肤顾问服务" },
      { icon: "", title: "积分兑礼", desc: "消费 1 元 = 1 积分，兑礼 1:1.3" },
      { icon: "", title: "生日礼遇", desc: "生日当月赠 100 积分" },
    ],
    colorClass: "text-amber-600",
  },
  DIAMOND: {
    level: "DIAMOND",
    name: "钻石卡会员",
    nameEn: "Diamond",
    icon: "",
    minSpent: 10000,
    maxSpent: null,
    benefits: [
      { icon: "", title: "不限次测肤", desc: "测肤次数不限，每日上限 10 次" },
      { icon: "", title: "档案永久保留", desc: "肌肤档案终身保留" },
      { icon: "", title: "专属 AI 护肤顾问", desc: "提供专属 AI 护肤顾问服务" },
      { icon: "", title: "积分兑礼", desc: "消费 1 元 = 1 积分，兑礼 1:1.5" },
      { icon: "", title: "生日礼遇", desc: "生日当月赠 200 积分" },
    ],
    colorClass: "text-indigo-500",
  },
};
