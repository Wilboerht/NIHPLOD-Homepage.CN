/**
 * 积分账本服务模块（2026-09 重新上线）
 *
 * 规则：
 * - 仅银卡及以上参与积分（REGULAR 不发放、不兑礼，见 BIRTHDAY_POINTS/调用方判断）。
 * - 消费发放：1 元 = 1 分（CONSUME），稳定期 7 天冻结（frozenUntil），6 个月过期（expiresAt）。
 * - 退款冲正（REFUND）：先冲未释放的冻结流水（最旧优先），剩余冲可用余额，可用可负（超兑债务）。
 * - 兑礼扣减（REDEEM）：FIFO 消耗已释放且未过期的流水；余额不足拒绝。
 * - 过期（EXPIRE）：冻结/已释放流水按剩余量清零，可用余额仅扣正数部分（负余额为债务，不由过期减免）。
 * - 生日积分（BIRTHDAY）：直接可用（无冻结），6 个月过期，每年一次幂等。
 *
 * 一致性：PointBalance 与 PointLedger 同事务更新；余额 = 流水剩余量之和（可用为负时代表超兑债务，
 * 后续新积分入账先行抵债）。所有函数接受事务客户端 tx，由调用方包在 prisma.$transaction 内。
 */
import { Prisma } from "@/generated/prisma/client";
import type { MembershipLevel } from "@/generated/prisma/client";
import { BIRTHDAY_POINTS } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";

export type PointTx = Prisma.TransactionClient;

export const POINT_FREEZE_DAYS = 7; // 消费积分稳定期（天）
export const POINT_EXPIRY_MONTHS = 6; // 积分有效期（月）

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/**
 * 消费发放积分（冻结稳定期 + 6 个月过期）
 * 幂等：同 userId+reference 已存在则跳过（重复上报不重复发放）。
 */
export async function creditSpendPoints(
  tx: PointTx,
  params: { userId: string; amount: number; reference: string; note?: string }
): Promise<{ duplicated: boolean }> {
  const { userId, amount, reference, note } = params;
  const existing = await tx.pointLedger.findUnique({
    where: { userId_reference: { userId, reference } },
  });
  if (existing) return { duplicated: true };

  const now = new Date();
  await tx.pointLedger.create({
    data: {
      userId,
      type: "CONSUME",
      amount,
      remaining: amount,
      reference,
      note: note ?? null,
      frozenUntil: addDays(now, POINT_FREEZE_DAYS),
      expiresAt: addMonths(now, POINT_EXPIRY_MONTHS),
    },
  });
  await tx.pointBalance.upsert({
    where: { userId },
    create: { userId, frozen: amount },
    update: { frozen: { increment: amount } },
  });
  return { duplicated: false };
}

/**
 * 退款冲正积分：先冲未释放的冻结流水（最旧优先），剩余冲可用余额（可负）。
 * 幂等：同 userId+reference 已存在则跳过。
 */
export async function refundSpendPoints(
  tx: PointTx,
  params: { userId: string; amount: number; reference: string; note?: string }
): Promise<{ duplicated: boolean }> {
  const { userId, amount, reference, note } = params;
  const existing = await tx.pointLedger.findUnique({
    where: { userId_reference: { userId, reference } },
  });
  if (existing) return { duplicated: true };

  // 从未参与积分（无余额行，普通档消费）：仅记录退款流水，不冲余额
  const balance = await tx.pointBalance.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!balance) {
    await tx.pointLedger.create({
      data: { userId, type: "REFUND", amount: -amount, reference, note: note ?? null },
    });
    return { duplicated: false };
  }

  // 先冲未释放的冻结流水
  const unreleased = await tx.pointLedger.findMany({
    where: { userId, releasedAt: null, remaining: { gt: 0 } },
    orderBy: { createdAt: "asc" },
    select: { id: true, remaining: true },
  });
  let rest = amount;
  let frozenDeduct = 0;
  for (const row of unreleased) {
    if (rest <= 0) break;
    const take = Math.min(row.remaining ?? 0, rest);
    rest -= take;
    frozenDeduct += take;
    await tx.pointLedger.update({
      where: { id: row.id },
      data: { remaining: { decrement: take } },
    });
  }

  await tx.pointLedger.create({
    data: { userId, type: "REFUND", amount: -amount, reference, note: note ?? null },
  });

  if (frozenDeduct > 0 || rest > 0) {
    await tx.pointBalance.upsert({
      where: { userId },
      // 防御分支：正常流水下余额行必已存在（流水由本模块写入且同步 upsert 余额）
      create: { userId, frozen: 0, available: -(frozenDeduct + rest) },
      update: {
        ...(frozenDeduct > 0 ? { frozen: { decrement: frozenDeduct } } : {}),
        ...(rest > 0 ? { available: { decrement: rest } } : {}),
      },
    });
  }
  return { duplicated: false };
}

/**
 * 释放到期冻结积分：frozenUntil 已到且未释放的发放流水 → 可用余额。
 * 返回释放的积分总量。
 */
export async function releaseFrozenPoints(
  tx: PointTx,
  userId: string,
  now: Date = new Date()
): Promise<number> {
  const due = await tx.pointLedger.findMany({
    where: {
      userId,
      type: "CONSUME",
      releasedAt: null,
      remaining: { gt: 0 },
      frozenUntil: { lte: now },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, remaining: true },
  });

  let total = 0;
  for (const row of due) {
    total += row.remaining ?? 0;
    await tx.pointLedger.update({
      where: { id: row.id },
      data: { releasedAt: now },
    });
  }
  if (total > 0) {
    await tx.pointBalance.upsert({
      where: { userId },
      create: { userId, available: total },
      update: { frozen: { decrement: total }, available: { increment: total } },
    });
  }
  return total;
}

/**
 * 过期扣减：剩余 >0 且已过期的发放流水清零，余额同步扣减。
 * - 已释放部分从可用余额扣（仅扣正数：负余额是超兑债务，不因过期减免）
 * - 未释放部分从冻结余额扣
 * 每日幂等：EXPIRE 流水 reference = expire:{userId}:{YYYY-MM-DD}（当天无剩余可扣则不写）。
 */
export async function expirePoints(
  tx: PointTx,
  userId: string,
  now: Date = new Date()
): Promise<number> {
  const expired = await tx.pointLedger.findMany({
    where: {
      userId,
      type: { in: ["CONSUME", "BIRTHDAY"] },
      remaining: { gt: 0 },
      expiresAt: { lte: now },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, remaining: true, releasedAt: true },
  });

  let availableExpired = 0;
  let frozenExpired = 0;
  for (const row of expired) {
    const remaining = row.remaining ?? 0;
    if (row.releasedAt) availableExpired += remaining;
    else frozenExpired += remaining;
    await tx.pointLedger.update({
      where: { id: row.id },
      data: { remaining: 0 },
    });
  }

  const total = availableExpired + frozenExpired;
  if (total <= 0) return 0;

  const balance = await tx.pointBalance.findUnique({
    where: { userId },
    select: { available: true, frozen: true },
  });
  const availableDeduct = Math.min(availableExpired, Math.max(0, balance?.available ?? 0));
  const frozenDeduct = Math.min(frozenExpired, balance?.frozen ?? 0);

  if (availableDeduct > 0 || frozenDeduct > 0) {
    await tx.pointBalance.upsert({
      where: { userId },
      create: { userId },
      update: {
        ...(availableDeduct > 0 ? { available: { decrement: availableDeduct } } : {}),
        ...(frozenDeduct > 0 ? { frozen: { decrement: frozenDeduct } } : {}),
      },
    });
  }

  await tx.pointLedger.create({
    data: {
      userId,
      type: "EXPIRE",
      amount: -total,
      // 时间戳 reference：同一用户同一天可能有多批不同时刻到期的流水（创建时间不同），
      // 每次过期处理独立记账，避免同参考键唯一冲突
      reference: `expire:${userId}:${now.getTime()}`,
      note: "积分过期（6 个月有效期）",
    },
  });
  return total;
}

/**
 * 账本物化：过期 + 释放（查询/兑礼前调用，保证余额与流水一致）。
 */
export async function materializePoints(
  tx: PointTx,
  userId: string,
  now: Date = new Date()
): Promise<void> {
  await expirePoints(tx, userId, now);
  await releaseFrozenPoints(tx, userId, now);
}

export type RedeemResult =
  | { ok: true; available: number; spent: number }
  | { ok: false; code: "INSUFFICIENT" | "DUPLICATE"; available: number };

/**
 * 兑礼扣减（商城兑换调用）：FIFO 消耗已释放且未过期流水。
 * 幂等：同 userId+reference 重复调用直接返回成功（不重复扣减）。
 */
export async function redeemPoints(
  tx: PointTx,
  params: { userId: string; amount: number; reference: string; note?: string }
): Promise<RedeemResult> {
  const { userId, amount, reference, note } = params;
  if (amount <= 0) return { ok: false, code: "INSUFFICIENT", available: 0 };

  const existing = await tx.pointLedger.findUnique({
    where: { userId_reference: { userId, reference } },
  });
  if (existing) {
    const balance = await tx.pointBalance.findUnique({
      where: { userId },
      select: { available: true },
    });
    return { ok: true, available: balance?.available ?? 0, spent: 0 };
  }

  const now = new Date();
  await materializePoints(tx, userId, now);

  const balance = await tx.pointBalance.findUnique({
    where: { userId },
    select: { available: true },
  });
  if (!balance || balance.available < amount) {
    return { ok: false, code: "INSUFFICIENT", available: balance?.available ?? 0 };
  }

  // FIFO 消耗（时间序，最旧优先）
  const rows = await tx.pointLedger.findMany({
    where: { userId, releasedAt: { not: null }, remaining: { gt: 0 }, expiresAt: { gt: now } },
    orderBy: { createdAt: "asc" },
    select: { id: true, remaining: true },
  });
  let rest = amount;
  for (const row of rows) {
    if (rest <= 0) break;
    const take = Math.min(row.remaining ?? 0, rest);
    rest -= take;
    await tx.pointLedger.update({
      where: { id: row.id },
      data: { remaining: { decrement: take } },
    });
  }
  if (rest > 0) {
    // 余额与流水不一致（理论不可达）：拒绝兑礼，事务回滚
    throw new Error("POINT_REDEEM_LEDGER_INCONSISTENT");
  }

  await tx.pointLedger.create({
    data: { userId, type: "REDEEM", amount: -amount, reference, note: note ?? null },
  });
  await tx.pointBalance.update({
    where: { userId },
    data: { available: { decrement: amount } },
  });
  return { ok: true, available: balance.available - amount, spent: amount };
}

export interface PointBalanceView {
  available: number;
  frozen: number;
  nextReleaseAt: Date | null;
}

/** 查询用户积分余额（含物化：过期 + 释放） */
export async function getPointBalanceView(
  tx: PointTx,
  userId: string,
  now: Date = new Date()
): Promise<PointBalanceView> {
  await materializePoints(tx, userId, now);
  const balance = await tx.pointBalance.findUnique({
    where: { userId },
    select: { available: true, frozen: true },
  });
  const nextRelease = await tx.pointLedger.findFirst({
    where: { userId, type: "CONSUME", releasedAt: null, remaining: { gt: 0 } },
    orderBy: { frozenUntil: "asc" },
    select: { frozenUntil: true },
  });
  return {
    available: balance?.available ?? 0,
    frozen: balance?.frozen ?? 0,
    nextReleaseAt: nextRelease?.frozenUntil ?? null,
  };
}

/**
 * 生日积分发放：直接可用（无冻结），6 个月过期，每年一次。
 * 幂等：reference = birthday:{userId}:{year} 唯一约束兜底；
 * 同时更新 user.lastBirthdayRewardYear 防止并发双发。
 * 普通档（BIRTHDAY_POINTS=0）不发放。
 */
export async function grantBirthdayPoints(
  tx: PointTx,
  params: { userId: string; level: MembershipLevel; year: number }
): Promise<{ granted: boolean; amount: number }> {
  const { userId, level, year } = params;
  const amount = BIRTHDAY_POINTS[level];
  if (amount <= 0) return { granted: false, amount: 0 };

  const now = new Date();
  await tx.pointLedger.create({
    data: {
      userId,
      type: "BIRTHDAY",
      amount,
      remaining: amount,
      reference: `birthday:${userId}:${year}`,
      releasedAt: now,
      expiresAt: addMonths(now, POINT_EXPIRY_MONTHS),
      note: "生日礼遇",
    },
  });
  await tx.pointBalance.upsert({
    where: { userId },
    create: { userId, available: amount },
    update: { available: { increment: amount } },
  });
  await tx.user.update({
    where: { id: userId },
    data: { lastBirthdayRewardYear: year },
  });
  return { granted: true, amount };
}

/**
 * 积分过期批量处理（cron 每日调用）：扫描存在过期剩余流水的用户并物化过期。
 * 单次最多处理 500 个用户（次日继续）。
 */
export async function expirePointsCron(): Promise<number> {
  const now = new Date();
  const due = await prisma.pointLedger.findMany({
    where: {
      type: { in: ["CONSUME", "BIRTHDAY"] },
      remaining: { gt: 0 },
      expiresAt: { lte: now },
    },
    select: { userId: true },
    distinct: ["userId"],
    take: 500,
  });

  let expiredTotal = 0;
  for (const { userId } of due) {
    try {
      const count = await prisma.$transaction((tx) => expirePoints(tx, userId, now));
      expiredTotal += count;
    } catch (error) {
      apiConsole.error(`[PointsExpire] 用户 ${userId} 积分过期处理失败:`, error);
    }
  }
  return expiredTotal;
}

/**
 * 生日积分批量发放（cron 每日调用）：当天生日的有效用户，
 * 按当前等级发放 BIRTHDAY_POINTS[level]（每年一次，CAS 抢占防并发双发）。
 * 普通档不发放（金额为 0）。
 */
export async function grantBirthdayRewards(): Promise<{ rewarded: number; skipped: number }> {
  const year = new Date().getFullYear();

  const candidates = await prisma.$queryRaw<{ id: string; membershipLevel: MembershipLevel }[]>`
    SELECT id, "membershipLevel" FROM "User"
    WHERE "birthday" IS NOT NULL
      AND "status" = 'ACTIVE'
      AND EXTRACT(MONTH FROM "birthday") = EXTRACT(MONTH FROM CURRENT_DATE)
      AND EXTRACT(DAY FROM "birthday") = EXTRACT(DAY FROM CURRENT_DATE)
      AND ("lastBirthdayRewardYear" IS NULL OR "lastBirthdayRewardYear" < ${year})
  `;

  let rewarded = 0;
  let skipped = 0;
  for (const user of candidates) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        // CAS 抢占：并发/重试场景下只有一次能抢占成功
        const claimed = await tx.user.updateMany({
          where: {
            id: user.id,
            OR: [{ lastBirthdayRewardYear: null }, { lastBirthdayRewardYear: { lt: year } }],
          },
          data: { lastBirthdayRewardYear: year },
        });
        if (claimed.count === 0) return { granted: false, amount: 0 };
        return grantBirthdayPoints(tx, { userId: user.id, level: user.membershipLevel, year });
      });
      if (result.granted) rewarded += 1;
      else skipped += 1;
    } catch (error) {
      skipped += 1;
      apiConsole.error(`[BirthdayPoints] 发放失败 user=${user.id}:`, error);
    }
  }
  return { rewarded, skipped };
}
