/**
 * 会员等级共享元信息
 * 用户端 / 管理端统一引用，避免散落的等级文案判断
 *
 * 等级体系（2026-08 重构）：
 * - 游客 GUEST：未注册用户（仅展示概念，不入库）
 * - 普通 REGULAR：完成注册
 * - 高级 ADVANCED：官方店铺任意消费一次
 * - VIP：历史购买金额满 ¥5,000
 * - SVIP：历史购买金额满 ¥20,000
 */
import type { MembershipLevel } from "@/generated/prisma/client";

export interface LevelMeta {
  label: string;
  emoji: string;
}

export const LEVEL_META: Record<MembershipLevel, LevelMeta> = {
  REGULAR: { label: "普通", emoji: "🪙" },
  ADVANCED: { label: "高级", emoji: "🥈" },
  VIP: { label: "VIP", emoji: "🥇" },
  SVIP: { label: "SVIP", emoji: "💎" },
};

/** 游客（未注册）仅展示用 */
export const GUEST_META: LevelMeta = { label: "游客", emoji: "👤" };

export function levelMeta(level: string | null | undefined): LevelMeta {
  if (!level) return GUEST_META;
  return LEVEL_META[level as MembershipLevel] ?? GUEST_META;
}

/** 等级展示文案，如 "💎 SVIP" */
export function levelDisplay(level: string | null | undefined): string {
  const meta = levelMeta(level);
  return `${meta.emoji} ${meta.label}`;
}

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
    name: "普通",
    nameEn: "Regular",
    icon: "🪙",
    minSpent: 0,
    maxSpent: 0,
    benefits: [{ icon: "🎁", title: "积分累积", desc: "消费10元=1积分" }],
    colorClass: "text-slate-400",
  },
  ADVANCED: {
    level: "ADVANCED",
    name: "高级",
    nameEn: "Advanced",
    icon: "🥈",
    minSpent: 1,
    maxSpent: 4999,
    benefits: [
      { icon: "🎁", title: "积分累积", desc: "消费10元=1积分" },
      { icon: "💬", title: "会员专线", desc: "会员专属服务通道" },
    ],
    colorClass: "text-teal-500",
  },
  VIP: {
    level: "VIP",
    name: "VIP",
    nameEn: "VIP",
    icon: "🥇",
    minSpent: 5000,
    maxSpent: 19999,
    benefits: [
      { icon: "🎁", title: "积分累积", desc: "消费10元=1积分" },
      // 与后端 grantBirthdayGiftIfDue 对齐：仅生日当天定额赠分（ADVANCED 无生日礼）
      { icon: "🎂", title: "生日礼遇", desc: "生日当天赠送 500 积分" },
      { icon: "⚡", title: "新品优先", desc: "新品首发优先体验" },
      { icon: "💬", title: "专属客服", desc: "1对1专属护肤顾问" },
    ],
    colorClass: "text-amber-500",
  },
  SVIP: {
    level: "SVIP",
    name: "SVIP",
    nameEn: "SVIP",
    icon: "💎",
    minSpent: 20000,
    maxSpent: null,
    benefits: [
      { icon: "🎁", title: "积分累积", desc: "消费10元=1积分" },
      { icon: "🎂", title: "生日礼遇", desc: "生日当天赠送 1000 积分" },
      { icon: "⚡", title: "新品优先", desc: "新品首发优先体验" },
      { icon: "💬", title: "专属客服", desc: "1对1专属护肤顾问" },
      { icon: "🌟", title: "品牌活动", desc: "尊享品牌沙龙与活动邀约" },
    ],
    colorClass: "text-violet-500",
  },
};
