/**
 * 积分账本服务模块（2026-09 重新上线）
 *
 * 规则：
 * - 消费发放 1 元 = 1 分（CONSUME）：所有等级均发放（含普通档），
 *   立即到账（无冻结期），兑换即刻可扣；普通档仅累积积分、不可兑礼
 *   （兑礼拦截见 POINT_REDEEM_RATES/point-gifts）。
 * - 6 个月过期（expiresAt）。
 * - 退款冲正（REFUND）：直接冲可用余额，可用可负（超兑债务）。
 * - 兑礼扣减（REDEEM）：FIFO 消耗未过期的发放流水；条件扣减（余额 ≥ 扣减量）防并发超额，余额不足拒绝。
 * - 过期（EXPIRE）：发放流水按剩余量清零，可用余额仅扣正数部分（负余额为债务，不由过期减免）。
 * - 生日积分（BIRTHDAY）：直接可用，6 个月过期，每年一次幂等。
 * - 打卡奖励（CHECKIN）：子站手动打卡发放，直接可用，6 个月过期，按 checkin:{userId}:{date} 幂等。
 *
 * 一致性：PointBalance 是权威余额，与 PointLedger 同事务更新。发放流水 remaining 只用于
 * FIFO 消耗与过期清理；负向人工调整/退款超兑时 available 可为负（债务），此时
 * available 与 remaining 之和不再相等，不能把两者简单相加做对账。
 * 所有函数接受事务客户端 tx，由调用方包在 prisma.$transaction 内。
 */
import { Prisma } from "@/generated/prisma/client";
import type { MembershipLevel } from "@/generated/prisma/client";
import { BIRTHDAY_POINTS } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";
import { getUtc8DateKey } from "@/lib/timezone";

export type PointTx = Prisma.TransactionClient;

export const POINT_EXPIRY_MONTHS = 6; // 积分有效期（月）
const BIRTHDAY_GRACE_DAYS = 7;

/**
 * 月末对齐的加月：1/31 + 1 个月 = 2/28（闰年 2/29），而不是溢出到 3/3。
 * 保证“6 个月有效期”不会因目标月份天数不足而被意外延长。
 */
function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months, 1);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/**
 * 生日补发窗口：最近 7 天（UTC+8），跨年时保留上一年的生日归属年。
 * 防止服务器当天宕机/任务失败后，用户永久错过生日积分。
 */
function getBirthdayWindow(now: Date = new Date()): Map<string, number> {
  const keys = new Map<string, number>();
  for (let i = 0; i < BIRTHDAY_GRACE_DAYS; i += 1) {
    const key = getUtc8DateKey(new Date(now.getTime() - i * 24 * 60 * 60 * 1000));
    keys.set(key.slice(5), Number(key.slice(0, 4)));
  }
  return keys;
}

/**
 * 余额行锁：
 * 所有会改动余额/发放流水剩余量的操作都先锁同一行，统一“先余额后流水”的锁顺序，
 * 避免兑礼（余额→流水）与退款/过期（流水→余额）互相死锁。
 * 行不存在时顺手创建（0 余额），保证并发首次入账也能串行化。
 */
async function lockPointBalance(tx: PointTx, userId: string): Promise<void> {
  await tx.pointBalance.upsert({
    where: { userId },
    create: { userId },
    update: { updatedAt: new Date() },
  });
}

/** 可重试的积分事务错误：PG 死锁/写冲突（Prisma P2034）与账本 CAS 冲突 */
export function isRetryablePointTxError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  if (code === "P2034") return true;
  const message = (error as { message?: string }).message ?? "";
  return message.includes("POINT_LEDGER_CONFLICT") || message.includes("SPENT_SYNC_CAS_CONFLICT");
}

/**
 * 积分事务重试包装：死锁/写冲突时短暂退避后重跑整个事务。
 * 事务内所有写入必须可安全重放（幂等检查也在事务内完成）。
 */
export async function withPointTxRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryablePointTxError(error) || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 15 * (attempt + 1)));
    }
  }
  throw lastError;
}

/**
 * 消费发放积分（立即到账，无冻结期；6 个月过期）
 * 幂等：同 userId+reference 已存在则跳过（重复上报不重复发放）。
 */
export async function creditSpendPoints(
  tx: PointTx,
  params: { userId: string; amount: number; reference: string; note?: string }
): Promise<{ duplicated: boolean }> {
  const { userId, amount, reference, note } = params;
  await lockPointBalance(tx, userId);
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
      releasedAt: now,
      expiresAt: addMonths(now, POINT_EXPIRY_MONTHS),
    },
  });
  await tx.pointBalance.upsert({
    where: { userId },
    create: { userId, available: amount },
    update: { available: { increment: amount } },
  });
  return { duplicated: false };
}

/**
 * 退款冲正积分：直接冲可用余额（可负）。
 * 幂等：同 userId+reference 已存在则跳过。
 */
export async function refundSpendPoints(
  tx: PointTx,
  params: { userId: string; amount: number; reference: string; note?: string }
): Promise<{ duplicated: boolean }> {
  const { userId, amount, reference, note } = params;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("POINT_REFUND_INVALID_AMOUNT");
  }

  await lockPointBalance(tx, userId);
  const existing = await tx.pointLedger.findUnique({
    where: { userId_reference: { userId, reference } },
  });
  if (existing) return { duplicated: true };

  // 先物化过期并按统一锁顺序锁余额行：退款只能消耗仍然有效的积分。
  // 避免“退款先于过期任务”时用已过期流水抵扣，导致最终余额随 cron 时序漂移。
  await materializePoints(tx, userId);

  // 先冲减原始发放流水的 remaining，再扣余额。
  // 若退款金额大于全部剩余量，差额自然成为负余额（超兑债务）。
  await consumeGrantsFifo(tx, userId, amount, { onlyUnexpired: true });

  await tx.pointLedger.create({
    data: { userId, type: "REFUND", amount: -amount, reference, note: note ?? null },
  });

  // 余额行不存在时也创建（available 为负），确保退款债务可被后续入账抵消
  await tx.pointBalance.upsert({
    where: { userId },
    create: { userId, available: -amount },
    update: { available: { decrement: amount } },
  });

  return { duplicated: false };
}

/** 会记 remaining 并参与过期清理的发放类流水类型 */
export const POINT_GRANT_LEDGER_TYPES = [
  "CONSUME",
  "BIRTHDAY",
  "CHECKIN",
  "ADJUST",
  "REDEEM_REFUND",
] as const;

/**
 * FIFO 消耗发放流水的剩余量。
 *
 * 退款与兑礼共用同一口径：先消耗最旧的 remaining，确保
 * `available = sum(remaining) + 负债务` 的账本不变量成立。
 *
 * 使用 `remaining >= take` 的条件更新做 CAS：并发退款/兑礼时，
 * 后到事务若发现该行剩余量已不足会抛出冲突，由外层事务回滚/重试。
 *
 * @returns 实际消耗的数量（可能小于 amount；差额由调用方作为债务处理）
 */
async function consumeGrantsFifo(
  tx: PointTx,
  userId: string,
  amount: number,
  options: { onlyUnexpired?: boolean; now?: Date } = {}
): Promise<number> {
  if (amount <= 0) return 0;

  const now = options.now ?? new Date();
  const rows = await tx.pointLedger.findMany({
    where: {
      userId,
      type: { in: [...POINT_GRANT_LEDGER_TYPES] },
      remaining: { gt: 0 },
      ...(options.onlyUnexpired ? { expiresAt: { gt: now } } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, remaining: true },
  });

  let rest = amount;
  for (const row of rows) {
    if (rest <= 0) break;
    const take = Math.min(row.remaining ?? 0, rest);
    if (take <= 0) continue;

    const claimed = await tx.pointLedger.updateMany({
      where: { id: row.id, remaining: { gte: take } },
      data: { remaining: { decrement: take } },
    });
    if (claimed.count === 0) {
      // 并发修改：让外层事务回滚，避免账本出现半消耗
      throw new Error("POINT_LEDGER_CONFLICT");
    }
    rest -= take;
  }

  return amount - rest;
}

/**
 * 过期扣减：剩余 >0 且已过期的发放流水清零，余额同步扣减。
 * - 已释放部分从可用余额扣（仅扣正数：负余额是超兑债务，不因过期减免）
 * - 未释放部分从冻结余额扣（无冻结期后为 0，仅保留防御分支）
 * 幂等与记账：EXPIRE 流水 reference = expire:{userId}:{时间戳}；同一用户同日可能有多批
 * 不同时刻到期的流水，每次物化独立记账（见下方写流水处实现注释）。
 */
export async function expirePoints(
  tx: PointTx,
  userId: string,
  now: Date = new Date()
): Promise<number> {
  // 先锁余额行，与兑礼/退款统一锁顺序，避免过期任务与用户兑礼互相死锁
  await lockPointBalance(tx, userId);
  const expired = await tx.pointLedger.findMany({
    where: {
      userId,
      type: { in: [...POINT_GRANT_LEDGER_TYPES] },
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
    // CAS 清零：并发场景（cron 与用户端物化同时执行）下只有一个事务能把该行剩余量清零，
    // 避免同一批过期积分被重复计入两次、导致余额重复扣减
    const claimed = await tx.pointLedger.updateMany({
      where: { id: row.id, remaining },
      data: { remaining: 0 },
    });
    if (claimed.count === 0) continue;
    if (row.releasedAt) availableExpired += remaining;
    else frozenExpired += remaining;
  }

  const total = availableExpired + frozenExpired;
  if (total <= 0) return 0;

  const balance = await tx.pointBalance.findUnique({
    where: { userId },
    select: { available: true, frozen: true },
  });
  const availableDeduct = Math.min(availableExpired, Math.max(0, balance?.available ?? 0));
  const frozenDeduct = Math.min(frozenExpired, balance?.frozen ?? 0);

  const deducted = availableDeduct + frozenDeduct;
  if (deducted > 0) {
    await tx.pointBalance.upsert({
      where: { userId },
      create: { userId },
      update: {
        ...(availableDeduct > 0 ? { available: { decrement: availableDeduct } } : {}),
        ...(frozenDeduct > 0 ? { frozen: { decrement: frozenDeduct } } : {}),
      },
    });
  }

  // 只记实际扣减额：余额为负（超兑债务）时过期不减免债务，
  // 记 -total 会让用户账单出现“过期扣了 200、余额却没变”的矛盾记录。
  // 全部为债务抵扣时无余额变动，不产生流水；发放流水的 remaining 已清零可供审计。
  if (deducted <= 0) return total;

  const debtOffset = total - deducted;
  await tx.pointLedger.create({
    data: {
      userId,
      type: "EXPIRE",
      amount: -deducted,
      // 时间戳 reference：同一用户同一天可能有多批不同时刻到期的流水（创建时间不同），
      // 每次过期处理独立记账，避免同参考键唯一冲突
      reference: `expire:${userId}:${now.getTime()}`,
      note:
        debtOffset > 0
          ? `积分过期（6 个月有效期；其中 ${debtOffset} 分用于抵扣超兑债务）`
          : "积分过期（6 个月有效期）",
    },
  });
  return total;
}

/**
 * 账本物化：过期处理（查询/兑礼前调用，保证余额与流水一致）。
 * 无冻结期，积分发放即到账，无需释放步骤。
 */
export async function materializePoints(
  tx: PointTx,
  userId: string,
  now: Date = new Date()
): Promise<void> {
  await expirePoints(tx, userId, now);
}

export type RedeemResult =
  | { ok: true; available: number; spent: number }
  | { ok: false; code: "INSUFFICIENT" | "DUPLICATE"; available: number };

/**
 * 兑礼扣减（商城/官网兑换调用）：条件扣减余额（CAS）→ FIFO 消耗未过期发放流水。
 * 余额行条件更新加行锁，串行化同一用户的并发扣减，绝不允许超额使用。
 * 幂等：同 userId+reference 重复调用直接返回成功（不重复扣减）。
 */
export async function redeemPoints(
  tx: PointTx,
  params: { userId: string; amount: number; reference: string; note?: string }
): Promise<RedeemResult> {
  const { userId, amount, reference, note } = params;
  if (amount <= 0) return { ok: false, code: "INSUFFICIENT", available: 0 };

  await lockPointBalance(tx, userId);
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

  // 条件扣减（CAS 语义）：以「余额仍 ≥ 扣减量」作为更新条件，命中 0 行即拒绝。
  // 余额行更新会获取行锁，同一用户的并发兑换/多端同时扣分被串行化，
  // 后到的事务在条件不满足时失败，绝不允许超额使用。
  const deducted = await tx.pointBalance.updateMany({
    where: { userId, available: { gte: amount } },
    data: { available: { decrement: amount } },
  });
  if (deducted.count === 0) {
    const current = await tx.pointBalance.findUnique({
      where: { userId },
      select: { available: true },
    });
    return { ok: false, code: "INSUFFICIENT", available: current?.available ?? 0 };
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
    if (take <= 0) continue;
    // 条件更新（CAS）：并发退款/过期已改过该行时命中 0 行，抛错让整个事务回滚，
    // 绝不能像无条件 decrement 那样把 remaining 扣成负数。
    const claimed = await tx.pointLedger.updateMany({
      where: { id: row.id, remaining: { gte: take } },
      data: { remaining: { decrement: take } },
    });
    if (claimed.count === 0) {
      throw new Error("POINT_LEDGER_CONFLICT");
    }
    rest -= take;
  }
  if (rest > 0) {
    // 余额与流水不一致（理论不可达）：拒绝兑礼，事务回滚（含条件扣减）
    throw new Error("POINT_REDEEM_LEDGER_INCONSISTENT");
  }

  await tx.pointLedger.create({
    data: { userId, type: "REDEEM", amount: -amount, reference, note: note ?? null },
  });
  return { ok: true, available: balance.available - amount, spent: amount };
}

export interface PointBalanceView {
  available: number;
  frozen: number;
  nextReleaseAt: Date | null;
}

/** 查询用户积分余额（含物化：过期） */
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
  return {
    available: balance?.available ?? 0,
    frozen: balance?.frozen ?? 0,
    // 无冻结期：积分发放即到账，无待解冻积分
    nextReleaseAt: null,
  };
}

/**
 * 人工调整积分（管理端补偿/冲正）：
 * - 正向：写入 ADJUST 流水（remaining + 6 个月过期），余额增加，可参与 FIFO 兑礼消耗与过期清理
 * - 负向：先 FIFO 消耗未过期发放流水，再冲可用余额（差额为负余额/超兑债务）
 * 幂等：userId+reference 唯一约束，重复调用返回 duplicated=true 不重复入账。
 */
export async function adjustPoints(
  tx: PointTx,
  params: { userId: string; amount: number; reference: string; note?: string }
): Promise<{ duplicated: boolean }> {
  const { userId, amount, reference, note } = params;
  if (!Number.isInteger(amount) || amount === 0) {
    throw new Error("POINT_ADJUST_INVALID_AMOUNT");
  }

  await lockPointBalance(tx, userId);
  const existing = await tx.pointLedger.findUnique({
    where: { userId_reference: { userId, reference } },
  });
  if (existing) return { duplicated: true };

  // 先物化过期并锁余额行：负向调整与退款同一口径，不能因 cron 时序而“少扣”债务
  await materializePoints(tx, userId);
  if (amount < 0) {
    await consumeGrantsFifo(tx, userId, -amount, { onlyUnexpired: true });
  }

  const now = new Date();
  await tx.pointLedger.create({
    data:
      amount > 0
        ? {
            userId,
            type: "ADJUST",
            amount,
            remaining: amount,
            reference,
            note: note ?? null,
            releasedAt: now,
            expiresAt: addMonths(now, POINT_EXPIRY_MONTHS),
          }
        : {
            userId,
            type: "ADJUST",
            amount,
            reference,
            note: note ?? null,
          },
  });
  await tx.pointBalance.upsert({
    where: { userId },
    create: { userId, available: amount },
    update: { available: { increment: amount } },
  });
  return { duplicated: false };
}

/**
 * 商城兑换撤销退分（内部 API 调用）：
 * - 正向发放（REDEEM_REFUND），计 remaining + 6 个月有效，可再次参与兑礼/过期；
 * - 幂等键固定为 `redeem-refund:{原兑换单号}`，重复上报不重复退分；
 * - 调用方必须先确认原兑换流水存在，避免无源退分。
 */
export async function refundRedeemPoints(
  tx: PointTx,
  params: { userId: string; amount: number; redemptionReference: string; note?: string }
): Promise<{ duplicated: boolean; amount: number }> {
  const { userId, amount, redemptionReference, note } = params;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("POINT_REDEEM_REFUND_INVALID_AMOUNT");
  }

  const reference = `redeem-refund:${redemptionReference}`;
  await lockPointBalance(tx, userId);
  const existing = await tx.pointLedger.findUnique({
    where: { userId_reference: { userId, reference } },
  });
  if (existing) return { duplicated: true, amount: 0 };

  const now = new Date();
  await tx.pointLedger.create({
    data: {
      userId,
      type: "REDEEM_REFUND",
      amount,
      remaining: amount,
      reference,
      note: note ?? "商城兑换撤销退还",
      releasedAt: now,
      expiresAt: addMonths(now, POINT_EXPIRY_MONTHS),
    },
  });
  await tx.pointBalance.upsert({
    where: { userId },
    create: { userId, available: amount },
    update: { available: { increment: amount } },
  });
  return { duplicated: false, amount };
}

/**
 * 打卡奖励发放（测肤子站手动打卡，经 /api/v1/internal/points/grant 调用）：
 * 直接可用（无冻结），6 个月过期。
 * 幂等：同 userId+reference（checkin:{userId}:{date}）已存在则跳过——
 * 打卡删除后重新打卡、并发重复提交、网络重试均不会重复发放。
 */
export async function grantCheckinPoints(
  tx: PointTx,
  params: { userId: string; amount: number; reference: string; note?: string }
): Promise<{ duplicated: boolean; amount: number }> {
  const { userId, amount, reference, note } = params;
  await lockPointBalance(tx, userId);
  const existing = await tx.pointLedger.findUnique({
    where: { userId_reference: { userId, reference } },
  });
  if (existing) return { duplicated: true, amount: 0 };

  const now = new Date();
  await tx.pointLedger.create({
    data: {
      userId,
      type: "CHECKIN",
      amount,
      remaining: amount,
      reference,
      note: note ?? null,
      releasedAt: now,
      expiresAt: addMonths(now, POINT_EXPIRY_MONTHS),
    },
  });
  await tx.pointBalance.upsert({
    where: { userId },
    create: { userId, available: amount },
    update: { available: { increment: amount } },
  });
  return { duplicated: false, amount };
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

  // 与消费同步保持一致的锁顺序：先用户行，再积分余额行。
  await tx.user.update({
    where: { id: userId },
    data: { lastBirthdayRewardYear: year },
  });
  await lockPointBalance(tx, userId);
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
      type: { in: [...POINT_GRANT_LEDGER_TYPES] },
      remaining: { gt: 0 },
      expiresAt: { lte: now },
    },
    select: { userId: true },
    distinct: ["userId"],
    take: 500,
  });

  let expiredTotal = 0;
  let failed = 0;
  for (const { userId } of due) {
    try {
      const count = await prisma.$transaction((tx) => expirePoints(tx, userId, now));
      expiredTotal += count;
    } catch (error) {
      failed += 1;
      apiConsole.error(`[PointsExpire] 用户 ${userId} 积分过期处理失败:`, error);
    }
  }
  if (failed > 0) {
    throw new Error(`POINTS_EXPIRE_PARTIAL_FAILURE:${failed}`);
  }
  return expiredTotal;
}

/**
 * 生日积分批量发放（cron 每日调用）：最近 7 天（UTC+8）生日的有效用户，
 * 按当前等级发放 BIRTHDAY_POINTS[level]（每年一次，CAS 抢占防并发双发）。
 * 宽限窗口用于服务器当天宕机/任务失败后的补发；普通档不发放（金额为 0）。
 */
export async function grantBirthdayRewards(): Promise<{ rewarded: number; skipped: number }> {
  const birthdayWindow = getBirthdayWindow();
  const birthdayKeys = [...birthdayWindow.keys()];

  const candidates = await prisma.$queryRaw<
    {
      id: string;
      membershipLevel: MembershipLevel;
      lastBirthdayRewardYear: number | null;
      birthdayKey: string;
    }[]
  >`
    SELECT id, "membershipLevel", "lastBirthdayRewardYear",
           to_char("birthday", 'MM-DD') AS "birthdayKey"
    FROM "User"
    WHERE "birthday" IS NOT NULL
      AND "status" = 'ACTIVE'
      AND to_char("birthday", 'MM-DD') IN (${Prisma.join(birthdayKeys)})
  `;

  let rewarded = 0;
  let skipped = 0;
  let failed = 0;
  for (const user of candidates) {
    const occasionYear = birthdayWindow.get(user.birthdayKey);
    if (!occasionYear) {
      skipped += 1;
      continue;
    }
    if (
      user.lastBirthdayRewardYear !== null &&
      user.lastBirthdayRewardYear >= occasionYear
    ) {
      skipped += 1;
      continue;
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        // 等级/状态在事务内重读：候选列表查询与发分之间可能发生升级/退款降档或封禁
        const fresh = await tx.user.findUnique({
          where: { id: user.id },
          select: { membershipLevel: true, status: true },
        });
        if (!fresh || fresh.status !== "ACTIVE") return { granted: false, amount: 0 };

        // CAS 抢占：并发重试场景下只有一次能抢占成功
        const claimed = await tx.user.updateMany({
          where: {
            id: user.id,
            OR: [
              { lastBirthdayRewardYear: null },
              { lastBirthdayRewardYear: { lt: occasionYear } },
            ],
          },
          data: { lastBirthdayRewardYear: occasionYear },
        });
        if (claimed.count === 0) return { granted: false, amount: 0 };
        return grantBirthdayPoints(tx, {
          userId: user.id,
          level: fresh.membershipLevel,
          year: occasionYear,
        });
      });
      if (result.granted) rewarded += 1;
      else skipped += 1;
    } catch (error) {
      skipped += 1;
      failed += 1;
      apiConsole.error(`[BirthdayPoints] 发放失败 user=${user.id}:`, error);
    }
  }
  if (failed > 0) {
    throw new Error(`BIRTHDAY_POINTS_PARTIAL_FAILURE:${failed}`);
  }
  return { rewarded, skipped };
}
