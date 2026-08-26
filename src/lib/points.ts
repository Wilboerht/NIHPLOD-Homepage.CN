/**
 * VIP 积分工具模块
 * 处理积分计算、等级升级、交易记录等
 *
 * 规则（2026-08 重构）：
 * - 等级由历史购买金额（totalSpent）划定：普通(注册) / 高级(消费≥1) / VIP(≥5000) / SVIP(≥20000)
 * - 积分与等级解耦：下单金额 10:1 累积（10 元 = 1 分）
 * - 生日月 3 倍积分（所有注册用户）；电商节倍数后台可配置；重叠取最大倍数不叠加
 * - 退款扣回积分并扣减 totalSpent，等级实时重算（可降级）
 */
import type { Prisma, MembershipLevel } from "@/generated/prisma/client";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";

// 等级阈值（按历史消费金额，元）
const LEVEL_THRESHOLDS: { level: MembershipLevel; minSpent: number }[] = [
  { level: "REGULAR", minSpent: 0 },
  { level: "ADVANCED", minSpent: 1 },
  { level: "VIP", minSpent: 5000 },
  { level: "SVIP", minSpent: 20000 },
];

/**
 * 根据历史消费金额计算会员等级
 */
export function calculateLevel(totalSpent: number): MembershipLevel {
  let level: MembershipLevel = "REGULAR";
  for (const t of LEVEL_THRESHOLDS) {
    if (totalSpent >= t.minSpent) level = t.level;
  }
  return level;
}

/**
 * 判断当前月份是否为用户生日月
 */
function isBirthdayMonth(birthday: Date | null): boolean {
  if (!birthday) return false;
  const now = new Date();
  return birthday.getMonth() === now.getMonth();
}

/**
 * 获取当前生效活动的最大积分倍数（无活动返回 1）
 */
export async function getActiveCampaignMultiplier(): Promise<number> {
  const now = new Date();
  const campaigns = await prisma.pointCampaign.findMany({
    where: { active: true, startAt: { lte: now }, endAt: { gte: now } },
    select: { multiplier: true },
  });
  return campaigns.reduce((max, c) => Math.max(max, c.multiplier), 1);
}

/**
 * 为支付成功的订单增加积分并累计消费金额
 * 调用时机：支付回调/模拟支付成功后
 *
 * @param tx Prisma 事务客户端（可选，传入则使用事务）
 * @param orderId 订单 ID
 * @param userId 用户 ID
 * @param payAmount 实付金额（元，Decimal 值转换为 number）
 * @param orderNo 订单号（用作 reference）
 */
export async function creditPointsForOrder(params: {
  tx?: Prisma.TransactionClient;
  orderId: string;
  userId: string;
  payAmount: number;
  orderNo: string;
}): Promise<{ points: number; newLevel: MembershipLevel; oldLevel: MembershipLevel } | null> {
  const { tx, userId, payAmount, orderNo } = params;
  const db = tx ?? prisma;

  try {
    // 幂等检查：该订单是否已发放过积分
    const existing = await db.pointTransaction.findFirst({
      where: { userId, type: "ORDER_REWARD", reference: orderNo },
    });
    if (existing) {
      apiConsole.debug(`[Points] 订单 ${orderNo} 积分已发放，跳过`);
      return null;
    }

    // 获取用户当前等级、积分、累计消费和生日
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { membershipLevel: true, totalPoints: true, totalSpent: true, birthday: true },
    });
    if (!user) return null;

    // 计算积分（10 元 = 1 分，取整）
    const basePoints = Math.floor(payAmount / 10);
    if (basePoints <= 0) {
      // 无积分可发，但仍需累计消费金额（可能触发升级）
      // 写入 0 积分流水作为幂等标记，防止回调重试导致 totalSpent 重复累加
      const newTotalSpent = user.totalSpent + Math.floor(payAmount);
      const newLevel = calculateLevel(newTotalSpent);
      await db.pointTransaction.create({
        data: {
          userId,
          points: 0,
          type: "ORDER_REWARD",
          reference: orderNo,
          note: `订单 ${orderNo} 消费奖励（金额不足 10 元，无积分，仅累计消费）`,
        },
      });
      if (newTotalSpent !== user.totalSpent || newLevel !== user.membershipLevel) {
        // 原子增减：避免并发支付时先读后写丢失更新（余额与流水不一致）
        await db.user.update({
          where: { id: userId },
          data: { totalSpent: { increment: Math.floor(payAmount) }, membershipLevel: newLevel },
        });
        invalidateProfileCache();
      }
      return { points: 0, newLevel, oldLevel: user.membershipLevel };
    }

    // 倍数：生日月 3 倍（所有注册用户）与活动倍数取最大，不叠加
    const birthdayMultiplier = isBirthdayMonth(user.birthday ?? null) ? 3 : 1;
    const campaignMultiplier = await getActiveCampaignMultiplier();
    const multiplier = Math.max(birthdayMultiplier, campaignMultiplier);

    const totalPointsEarned = basePoints * multiplier;

    const newTotalSpent = user.totalSpent + Math.floor(payAmount);
    const newLevel = calculateLevel(newTotalSpent);
    const oldLevel = user.membershipLevel;

    // 写入积分交易记录
    const noteParts = [`订单 ${orderNo} 消费奖励（10:1）`];
    if (birthdayMultiplier > 1 && multiplier === birthdayMultiplier) noteParts.push("生日3倍积分");
    if (campaignMultiplier > 1 && multiplier === campaignMultiplier)
      noteParts.push(`活动${campaignMultiplier}倍积分`);
    await db.pointTransaction.create({
      data: {
        userId,
        points: totalPointsEarned,
        type: "ORDER_REWARD",
        reference: orderNo,
        note: noteParts.join("，"),
      },
    });

    // 更新用户积分、累计消费和等级
    // 原子增减：避免两笔订单并发支付时先读后写丢失更新（余额少于流水之和）；
    // 等级基于读取快照计算，并发下最多滞后一次结算，下次结算自动纠正
    await db.user.update({
      where: { id: userId },
      data: {
        totalPoints: { increment: totalPointsEarned },
        totalSpent: { increment: Math.floor(payAmount) },
        membershipLevel: newLevel,
      },
    });

    apiConsole.info(
      `[Points] 用户 ${userId} 获得 ${totalPointsEarned} 积分 (10:1, ${multiplier}倍, 总 ${
        user.totalPoints + totalPointsEarned
      }), 消费累计 ${newTotalSpent}, 等级: ${oldLevel} → ${newLevel}`
    );

    invalidateProfileCache();

    return { points: totalPointsEarned, newLevel, oldLevel };
  } catch (error) {
    apiConsole.error("[Points] 积分发放失败:", error);
    // 积分发放失败不应阻塞支付流程
    return null;
  }
}

/**
 * 订单退款时扣回该订单发放的积分并扣减累计消费
 * 调用时机：退款最终确认（finalizeRefund）后
 *
 * 扣回范围：
 * - ORDER_REWARD（订单消费奖励，含倍数加成）
 * - LEVEL_UP_BONUS（历史遗留的升级奖励记录）
 *
 * 积分不会扣成负数；totalSpent 不下穿 0；等级按剩余消费金额重新计算（可降级）。
 * 幂等：已扣回过（ORDER_REWARD_REVERSAL + orderNo）则跳过。
 */
export async function refundPointsForOrder(params: {
  tx?: Prisma.TransactionClient;
  orderId: string;
  userId: string;
  orderNo: string;
  refundAmount: number;
}): Promise<{ deductedPoints: number } | null> {
  const { tx, userId, orderNo, refundAmount } = params;
  const db = tx ?? prisma;

  try {
    // 幂等检查：该订单退款积分是否已扣回
    const existing = await db.pointTransaction.findFirst({
      where: { userId, type: "ORDER_REWARD_REVERSAL", reference: orderNo },
    });
    if (existing) {
      apiConsole.debug(`[Points] 订单 ${orderNo} 退款积分已扣回，跳过`);
      return null;
    }

    // 汇总该订单发放的积分（消费奖励 + 历史升级奖励）
    const earnedTransactions = await db.pointTransaction.findMany({
      where: {
        userId,
        OR: [
          { type: "ORDER_REWARD", reference: orderNo },
          { type: "LEVEL_UP_BONUS", reference: orderNo },
        ],
      },
      select: { points: true },
    });

    const totalEarned = earnedTransactions.reduce((sum, t) => sum + t.points, 0);

    // 获取用户当前积分与累计消费
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { totalPoints: true, totalSpent: true },
    });
    if (!user) return null;

    const deducted = Math.min(Math.max(0, totalEarned), user.totalPoints);
    const newTotalPoints = user.totalPoints - deducted;
    const newTotalSpent = Math.max(0, user.totalSpent - Math.floor(refundAmount));
    const newLevel = calculateLevel(newTotalSpent);

    // 始终写入扣回记录（即使 0 积分）作为幂等标记，防止重复退款重复扣减 totalSpent
    await db.pointTransaction.create({
      data: {
        userId,
        points: -deducted,
        type: "ORDER_REWARD_REVERSAL",
        reference: orderNo,
        note: `订单 ${orderNo} 退款，扣回消费奖励积分`,
      },
    });

    // 更新用户积分、累计消费和等级
    // 原子增减（与发放路径对齐）：totalSpent 扣减额以当前余额封顶，不下穿 0
    await db.user.update({
      where: { id: userId },
      data: {
        totalPoints: { decrement: deducted },
        totalSpent: { decrement: Math.min(Math.floor(refundAmount), user.totalSpent) },
        membershipLevel: newLevel,
      },
    });

    apiConsole.info(
      `[Points] 订单 ${orderNo} 退款，扣回 ${deducted} 积分 (总 ${newTotalPoints}), 消费累计 ${newTotalSpent}, 等级重算 ${newLevel}`
    );

    invalidateProfileCache();

    return { deductedPoints: deducted };
  } catch (error) {
    apiConsole.error("[Points] 退款扣回积分失败:", error);
    // 扣回失败不应阻塞退款流程，但记录日志供人工处理
    return null;
  }
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
        // 保证流水合计永远等于余额（与 refundPointsForOrder 的扣回口径一致）
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
 * 生日礼发放（共享入口，供 /api/user/vip 与 /api/user/profile 调用）
 *
 * 资格：生日当天 + VIP/SVIP（VIP +500 / SVIP +1000）
 * 幂等：reference = BIRTHDAY-{年份}，依赖 PointTransaction 的
 * @@unique([userId, type, reference]) 唯一约束，先写后查，
 * 并发请求下仅一个能写入成功，其余捕获 P2002 视为已发放。
 */
export async function grantBirthdayGiftIfDue(
  userId: string
): Promise<{ granted: boolean; points: number }> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { membershipLevel: true, birthday: true },
    });

    if (!user?.birthday) return { granted: false, points: 0 };
    if (user.membershipLevel !== "VIP" && user.membershipLevel !== "SVIP")
      return { granted: false, points: 0 };

    const now = new Date();
    const birthdayThisYear = new Date(
      now.getFullYear(),
      user.birthday.getMonth(),
      user.birthday.getDate()
    );
    const isToday =
      birthdayThisYear.getDate() === now.getDate() &&
      birthdayThisYear.getMonth() === now.getMonth();
    if (!isToday) return { granted: false, points: 0 };

    const giftPoints = user.membershipLevel === "SVIP" ? 1000 : 500;
    const giftLabel = user.membershipLevel === "SVIP" ? "SVIP生日礼盒" : "VIP生日礼遇";
    const reference = `BIRTHDAY-${now.getFullYear()}`;

    try {
      await prisma.pointTransaction.create({
        data: {
          userId,
          points: giftPoints,
          type: "BIRTHDAY_GIFT",
          reference,
          note: `${giftLabel} — ${now.getFullYear()}年生日赠礼`,
        },
      });
    } catch (e) {
      // P2002 唯一约束冲突 = 今年已发放过
      if ((e as { code?: string }).code === "P2002") {
        return { granted: false, points: 0 };
      }
      throw e;
    }

    await prisma.user.update({
      where: { id: userId },
      data: { totalPoints: { increment: giftPoints } },
    });
    invalidateProfileCache();

    apiConsole.info(
      `[BirthdayGift] 用户 ${userId} (${user.membershipLevel}) 生日赠送 ${giftPoints} 积分`
    );
    return { granted: true, points: giftPoints };
  } catch (error) {
    apiConsole.error("[BirthdayGift] 发放失败:", error);
    // 生日礼发放失败不应阻塞主请求
    return { granted: false, points: 0 };
  }
}

/**
 * 失效 profile 缓存，确保 AuthContext 拉取最新积分与等级
 */
function invalidateProfileCache(): void {
  try {
    revalidateTag("user-profile", "max");
  } catch {
    // revalidateTag 在非请求上下文中可能失败（如 standalone 模式），忽略
  }
}
