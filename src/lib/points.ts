/**
 * 会员等级工具模块
 * 处理等级计算、外部商城消费额同步、积分联动
 *
 * 规则（2026-09 四档）：
 * - 等级由历史购买金额（totalSpent）划定，永久有效、实时重算（可升可降）：
 *   普通(注册) / 银卡(≥¥1,000) / 金卡(≥¥5,000) / 钻石(≥¥10,000)
 * - 官网不再直接售卖：消费额变动由外部商城通过签名接口同步入账
 * - 各档首次达档记录 activatedAt（仅成长展示，不产生有效期）
 * - 积分：所有等级消费 1 元 = 1 分（含普通档），稳定期 7 天冻结，6 个月过期；
 *   退款冲正可负；账本逻辑见 points-ledger.ts
 * - 兑礼：银卡及以上可兑（普通档仅累积积分、不开积分商城，见 POINT_REDEEM_RATES）
 */
import type { MembershipLevel } from "@/generated/prisma/client";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";
import { creditSpendPoints, refundSpendPoints } from "@/lib/points-ledger";

// 等级阈值（按历史消费金额，元）
// 判级以此处硬编码阈值为准（唯一权威）；管理端可编辑的 MembershipBenefit.minSpent
// 仅影响前台展示的权益文案（如"满 ¥1,000 升级银卡会员"），不参与实际等级计算。
const LEVEL_THRESHOLDS: { level: MembershipLevel; minSpent: number }[] = [
  { level: "REGULAR", minSpent: 0 },
  { level: "SILVER", minSpent: 1000 },
  { level: "GOLD", minSpent: 5000 },
  { level: "DIAMOND", minSpent: 10000 },
];

/**
 * 根据历史消费金额计算会员等级
 * 判级阈值以本模块 LEVEL_THRESHOLDS 硬编码为准；DB 中 MembershipBenefit.minSpent
 * 可在管理端编辑，但仅用于展示文案，不影响此处的判级结果。
 */
export function calculateLevel(totalSpent: number): MembershipLevel {
  let level: MembershipLevel = "REGULAR";
  for (const t of LEVEL_THRESHOLDS) {
    if (totalSpent >= t.minSpent) level = t.level;
  }
  return level;
}

/** 首次达档激活日字段名（写入 User 表，仅成长展示） */
const ACTIVATED_AT_FIELD: Partial<Record<MembershipLevel, "silverActivatedAt" | "goldActivatedAt" | "diamondActivatedAt">> = {
  SILVER: "silverActivatedAt",
  GOLD: "goldActivatedAt",
  DIAMOND: "diamondActivatedAt",
};

// 外部同步入账的 CAS 重试上限（快照被并发修改时重读重试）
const MAX_SYNC_CAS_RETRIES = 3;

/**
 * 外部系统（商城）消费额变动同步入账
 * 调用时机：POST /api/v1/internal/points/sync（商城签名上报）
 *
 * 官网是消费额/等级/积分权威账本：商城侧的消费额变动通过此函数入账。
 * - 幂等：以 reference 作为商城侧唯一单据号，依赖 SpentSyncRecord 的
 *   @@unique([userId, reference]) 约束，重复上报（P2002）直接返回
 *   当前权威消费额并标记 duplicated=true，不重复入账。
 * - 积分联动：正向变动发放积分（稳定期冻结），负向变动冲正积分（先冻结后可用，可负）。
 * - 升级：首次达档写入对应 activatedAt。
 *
 * @returns 入账后的权威消费额与等级；用户不存在返回 null
 */
export async function applyExternalSpentSync(params: {
  userId: string;
  spentDelta: number; // 消费额变动（元，整数，可为 0）
  reference: string; // 商城侧唯一单据号（幂等键）
  note?: string;
}): Promise<{
  totalSpent: number;
  membershipLevel: MembershipLevel;
  duplicated: boolean;
} | null> {
  const { userId, spentDelta, reference, note } = params;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 幂等检查：同一用户同一单据已入账过，直接返回当前权威消费额
      const existing = await tx.spentSyncRecord.findUnique({
        where: { userId_reference: { userId, reference } },
      });
      if (existing) {
        const current = await tx.user.findUnique({
          where: { id: userId },
          select: { totalSpent: true, membershipLevel: true },
        });
        if (!current) return null;
        return { ...current, duplicated: true };
      }

      // 乐观并发控制（CAS）：以读取快照作为更新条件，快照被并发修改时 updateMany 命中 0 行，
      // 重读快照重试，避免并发同步下丢失更新。
      for (let attempt = 0; attempt < MAX_SYNC_CAS_RETRIES; attempt++) {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: {
            totalSpent: true,
            membershipLevel: true,
            silverActivatedAt: true,
            goldActivatedAt: true,
            diamondActivatedAt: true,
          },
        });
        if (!user) return null;

        // 钳制下限 0：退款累计不得超过历史消费
        const newTotalSpent = Math.max(0, user.totalSpent + spentDelta);
        const newLevel = calculateLevel(newTotalSpent); // 按新消费额重算等级（可升可降）

        // 首次达档激活日（仅写入、不覆盖）
        const activatedField = ACTIVATED_AT_FIELD[newLevel];
        const activatedAt =
          activatedField && !user[activatedField] ? new Date() : undefined;

        const cas = await tx.user.updateMany({
          where: { id: userId, totalSpent: user.totalSpent },
          data: {
            totalSpent: newTotalSpent,
            membershipLevel: newLevel,
            ...(activatedAt && activatedField ? { [activatedField]: activatedAt } : {}),
          },
        });
        if (cas.count === 0) continue; // 快照过期（并发修改），重读重试

        await tx.spentSyncRecord.create({
          data: { userId, reference, spentDelta, note },
        });

        // 积分联动（与消费额同事务，保证账实一致）
        // 所有等级均按 1:1 发放积分（普通档仅累积、不可兑礼，兑礼侧按兑礼率拦截）
        if (spentDelta > 0) {
          await creditSpendPoints(tx, {
            userId,
            amount: spentDelta,
            reference: `points:${reference}`,
            note: note ?? "消费发放积分",
          });
        } else if (spentDelta < 0) {
          await refundSpendPoints(tx, {
            userId,
            amount: -spentDelta,
            reference: `points:${reference}`,
            note: note ?? "退款冲正积分",
          });
        }

        return {
          totalSpent: newTotalSpent,
          membershipLevel: newLevel,
          duplicated: false,
        };
      }
      // CAS 重试耗尽（持续高频并发冲突），抛出由路由层 500 兜底
      throw new Error("SPENT_SYNC_CAS_CONFLICT");
    });

    if (result) {
      apiConsole.info(
        `[SpentSync] 外部同步入账：用户 ${userId} 消费 ${
          spentDelta >= 0 ? "+" : ""
        }${spentDelta}（ref=${reference}），累计消费 ${result.totalSpent}，等级 ${
          result.membershipLevel
        }`
      );
      invalidateProfileCache();
    }
    return result;
  } catch (error) {
    // P2002 唯一约束冲突 = 该 reference 已入账过，幂等返回当前权威消费额
    if ((error as { code?: string }).code === "P2002") {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { totalSpent: true, membershipLevel: true },
      });
      if (!user) return null;
      apiConsole.info(`[SpentSync] 外部同步重复上报（ref=${reference}），按幂等处理`);
      return { ...user, duplicated: true };
    }
    throw error;
  }
}

/**
 * 失效 profile 缓存，确保 AuthContext 拉取最新等级。
 * 消费额/等级变动的所有入口（外部同步等）都应调用。
 */
export function invalidateProfileCache(): void {
  try {
    revalidateTag("user-profile", "max");
  } catch {
    // revalidateTag 在非请求上下文中可能失败（如 standalone 模式），忽略
  }
}
