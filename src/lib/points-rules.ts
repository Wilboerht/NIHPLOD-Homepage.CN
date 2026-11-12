/**
 * 积分规则共享元信息（OAuth 规则接口 / 客户端展示共用）
 *
 * 唯一权威来源：
 * - 等级门槛/兑礼率/生日积分/等级名称：src/lib/membership.ts
 * - 积分有效期：src/lib/points-ledger.ts
 * - 消费积分比例：src/lib/membership.ts
 */
import type { MembershipLevel } from "@/generated/prisma/client";
import {
  BIRTHDAY_POINTS,
  LEVEL_META,
  LEVEL_THRESHOLDS,
  MEMBERSHIP_LEVELS,
  POINT_EARN_YUAN_PER_POINT,
  POINT_REDEEM_RATES,
} from "@/lib/membership";
import { POINT_EXPIRY_MONTHS } from "@/lib/points-ledger";

export interface PointsRuleLevel {
  level: MembershipLevel;
  name: string;
  minSpent: number;
  redeemRate: number | null;
  birthdayPoints: number;
}

export interface PointsRulesView {
  earnYuanPerPoint: number;
  expiryMonths: number;
  levels: PointsRuleLevel[];
}

export function getPointsRulesView(): PointsRulesView {
  return {
    earnYuanPerPoint: POINT_EARN_YUAN_PER_POINT,
    expiryMonths: POINT_EXPIRY_MONTHS,
    levels: MEMBERSHIP_LEVELS.map((level) => ({
      level,
      name: LEVEL_META[level].label,
      minSpent: LEVEL_THRESHOLDS[level],
      redeemRate: POINT_REDEEM_RATES[level],
      birthdayPoints: BIRTHDAY_POINTS[level],
    })),
  };
}
