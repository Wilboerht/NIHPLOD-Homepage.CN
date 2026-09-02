/**
 * 会员等级共享元信息
 * 用户端 / 管理端统一引用，避免散落的等级文案判断
 *
 * 等级体系（2026-09 简化）：
 * - 非会员 GUEST：未注册用户（仅展示概念，不入库）
 * - 普通会员 REGULAR：完成注册
 * - 高级会员 ADVANCED：官方店铺历史购买金额满 ¥1,000
 */
import type { MembershipLevel } from "@/generated/prisma/client";

export interface LevelMeta {
  label: string;
}

export const LEVEL_META: Record<MembershipLevel, LevelMeta> = {
  REGULAR: { label: "普通会员" },
  ADVANCED: { label: "高级会员" },
};

/** 非会员（未注册）仅展示用 */
export const GUEST_META: LevelMeta = { label: "非会员" };

export function levelMeta(level: string | null | undefined): LevelMeta {
  if (!level) return GUEST_META;
  return LEVEL_META[level as MembershipLevel] ?? GUEST_META;
}

/** 等级展示文案，如 "高级会员" */
export function levelDisplay(level: string | null | undefined): string {
  return levelMeta(level).label;
}

// ============================================
// 高级会员里程碑（等级内成长体系）
// 不新增等级名：高级会员内部按累计消费解锁礼遇，
// 由 totalSpent 推导，纯展示层逻辑。
// ============================================

export interface LevelMilestone {
  threshold: number; // 累计消费门槛（元）
  name: string;
  benefits: LevelBenefitItem[];
}

export const ADVANCED_MILESTONES: LevelMilestone[] = [
  {
    threshold: 3000,
    name: "年度礼遇",
    benefits: [{ icon: "", title: "年度生日礼盒", desc: "每年生日获赠专属礼盒" }],
  },
  {
    threshold: 10000,
    name: "尊享礼遇",
    benefits: [{ icon: "", title: "品牌沙龙邀请", desc: "受邀参加线下品牌沙龙" }],
  },
];

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
      { icon: "", title: "测肤体验", desc: "注册即享 12 次 AI 测肤体验机会" },
      { icon: "", title: "数据留存", desc: "测肤数据留存 365 天" },
    ],
    colorClass: "text-slate-400",
  },
  ADVANCED: {
    level: "ADVANCED",
    name: "高级会员",
    nameEn: "Advanced",
    icon: "",
    minSpent: 1000,
    maxSpent: null,
    benefits: [
      { icon: "", title: "无限测肤", desc: "测肤总次数不限，每日上限 3 次" },
      { icon: "", title: "档案永久保留", desc: "肌肤档案永久保留" },
      { icon: "", title: "专属 AI 护肤顾问", desc: "提供专属 AI 护肤顾问服务" },
      { icon: "", title: "优先发货", desc: "订单优先发货处理" },
      { icon: "", title: "专属客服坐席", desc: "1对1专属客服坐席服务" },
    ],
    colorClass: "text-teal-500",
  },
};
