/**
 * 会员等级与积分账本工具模块
 * 处理等级计算、外部商城积分同步等
 *
 * 规则（2026-09 简化）：
 * - 等级由历史购买金额（totalSpent）划定：普通会员(注册) / 高级会员(≥¥1,000)
 * - 官网不再直接售卖：消费/等级变动由外部商城通过签名接口同步入账（EXTERNAL_SYNC）
 * - 等级按 totalSpent 实时重算（可升可降）
 */
import type { MembershipLevel } from "@/generated/prisma/client";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";

// 等级阈值（按历史消费金额，元）
// 判级以此处硬编码阈值为准（唯一权威）；管理端可编辑的 MembershipBenefit.minSpent
// 仅影响前台展示的权益文案（如"满 ¥1,000 升级高级会员"），不参与实际等级计算。
const LEVEL_THRESHOLDS: { level: MembershipLevel; minSpent: number }[] = [
  { level: "REGULAR", minSpent: 0 },
  { level: "ADVANCED", minSpent: 1000 },
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

// 外部同步入账的 CAS 重试上限（快照被并发修改时重读重试）
const MAX_SYNC_CAS_RETRIES = 3;

/**
 * 外部系统（商城）积分/消费变动同步入账
 * 调用时机：POST /api/v1/internal/points/sync（商城签名上报）
 *
 * 官网是积分/等级权威账本：商城侧的积分变动通过此函数入账。
 * 幂等：以 reference 作为商城侧唯一单据号，依赖 PointTransaction 的
 * @@unique([userId, type, reference]) 约束，重复上报（P2002）直接返回
 * 当前权威余额并标记 duplicated=true，不重复加扣分。
 *
 * @returns 入账后的权威余额与等级；用户不存在返回 null
 */
export async function applyExternalPointsSync(params: {
  userId: string;
  delta: number; // 积分变动（正加负减，非零整数）
  spentDelta: number; // 消费额变动（元，整数，可为 0）
  reference: string; // 商城侧唯一单据号（幂等键）
  note?: string;
}): Promise<{
  totalPoints: number;
  totalSpent: number;
  membershipLevel: MembershipLevel;
  duplicated: boolean;
} | null> {
  const { userId, delta, spentDelta, reference, note } = params;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 乐观并发控制（CAS）：以读取快照作为更新条件，快照被并发修改时 updateMany 命中 0 行，
      // 重读快照重试。避免「读快照 → 钳制 → 原子增减」在并发负 delta 下绕过钳制（余额扣成负数）。
      for (let attempt = 0; attempt < MAX_SYNC_CAS_RETRIES; attempt++) {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { totalPoints: true, totalSpent: true, membershipLevel: true },
        });
        if (!user) return null;

        // 钳制下限 0：余额不足时只扣到 0，流水记录**实际生效**的变动量（而非请求值），
        // 保证流水合计永远等于余额
        const newTotalPoints = Math.max(0, user.totalPoints + delta);
        const newTotalSpent = Math.max(0, user.totalSpent + spentDelta);
        const effectiveDelta = newTotalPoints - user.totalPoints;
        const newLevel = calculateLevel(newTotalSpent); // 按新消费额重算等级（可升可降）

        const cas = await tx.user.updateMany({
          where: { id: userId, totalPoints: user.totalPoints, totalSpent: user.totalSpent },
          data: { totalPoints: newTotalPoints, totalSpent: newTotalSpent, membershipLevel: newLevel },
        });
        if (cas.count === 0) continue; // 快照过期（并发修改），重读重试

        // 唯一约束冲突（重复上报）会中止事务，在事务外捕获 P2002 处理
        await tx.pointTransaction.create({
          data: { userId, points: effectiveDelta, type: "EXTERNAL_SYNC", reference, note },
        });

        return {
          totalPoints: newTotalPoints,
          totalSpent: newTotalSpent,
          membershipLevel: newLevel,
          duplicated: false,
        };
      }
      // CAS 重试耗尽（持续高频并发冲突），抛出由路由层 500 兜底
      throw new Error("POINTS_SYNC_CAS_CONFLICT");
    });

    if (result) {
      apiConsole.info(
        `[Points] 外部同步入账：用户 ${userId} 积分 ${delta >= 0 ? "+" : ""}${delta}，消费 ${
          spentDelta >= 0 ? "+" : ""
        }${spentDelta}（ref=${reference}），余额 ${result.totalPoints}，累计消费 ${
          result.totalSpent
        }，等级 ${result.membershipLevel}`
      );
      invalidateProfileCache();
    }
    return result;
  } catch (error) {
    // P2002 唯一约束冲突 = 该 reference 已入账过，幂等返回当前权威余额
    if ((error as { code?: string }).code === "P2002") {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { totalPoints: true, totalSpent: true, membershipLevel: true },
      });
      if (!user) return null;
      apiConsole.info(`[Points] 外部同步重复上报（ref=${reference}），按幂等处理`);
      return { ...user, duplicated: true };
    }
    throw error;
  }
}

/**
 * 失效 profile 缓存，确保 AuthContext 拉取最新积分与等级。
 * 积分余额变动的所有入口（外部同步等）都应调用。
 */
export function invalidateProfileCache(): void {
  try {
    revalidateTag("user-profile", "max");
  } catch {
    // revalidateTag 在非请求上下文中可能失败（如 standalone 模式），忽略
  }
}
