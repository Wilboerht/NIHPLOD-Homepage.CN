import { randomUUID } from "crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { SpentOrderSource } from "@/generated/prisma/client";

export function normalizeOrderNo(orderNo: string): string {
  return orderNo.trim().toUpperCase();
}

export function normalizeOptionalOrderNo(orderNo: string | null | undefined): {
  orderNo: string | null;
  orderNoKey: string | null;
} {
  const trimmed = orderNo?.trim();
  if (!trimmed) return { orderNo: null, orderNoKey: null };
  return { orderNo: trimmed, orderNoKey: normalizeOrderNo(trimmed) };
}

export class SpentOrderConflictError extends Error {
  readonly code = "SPENT_ORDER_CONFLICT";
  readonly orderNoKey: string;
  readonly source: SpentOrderSource;

  constructor(orderNoKey: string, source: SpentOrderSource) {
    super(`订单号 ${orderNoKey} 已由 ${source} 入账`);
    this.name = "SpentOrderConflictError";
    this.orderNoKey = orderNoKey;
    this.source = source;
  }
}

export class SpentRefundNotLinkedError extends Error {
  readonly code = "SPENT_REFUND_NOT_LINKED";
  readonly orderNoKey: string;

  constructor(orderNoKey: string) {
    super(`订单号 ${orderNoKey} 没有可退款的原始入账记录`);
    this.name = "SpentRefundNotLinkedError";
    this.orderNoKey = orderNoKey;
  }
}

export class SpentRefundExceedsOriginalError extends Error {
  readonly code = "SPENT_REFUND_EXCEEDS_ORIGINAL";
  readonly orderNoKey: string;

  constructor(orderNoKey: string) {
    super(`订单号 ${orderNoKey} 的累计退款超过原始入账金额`);
    this.name = "SpentRefundExceedsOriginalError";
    this.orderNoKey = orderNoKey;
  }
}

export class SpentRefundReservationConflictError extends Error {
  readonly code = "SPENT_REFUND_RESERVATION_CONFLICT";
  readonly orderNoKey: string;

  constructor(orderNoKey: string) {
    super(`订单号 ${orderNoKey} 的退款占用发生并发冲突`);
    this.name = "SpentRefundReservationConflictError";
    this.orderNoKey = orderNoKey;
  }
}

export class SpentOrderHasRefundsError extends Error {
  readonly code = "SPENT_ORDER_HAS_REFUNDS";
  readonly orderNoKey: string;

  constructor(orderNoKey: string) {
    super(`订单号 ${orderNoKey} 存在退款记录，不能直接释放占用`);
    this.name = "SpentOrderHasRefundsError";
    this.orderNoKey = orderNoKey;
  }
}

/**
 * 原子占用一个全局订单号。
 *
 * 使用 INSERT ... ON CONFLICT (orderNoKey) DO NOTHING，避免并发窗口下
 * P2002 把整个事务置为 aborted；冲突时抛出 SpentOrderConflictError，
 * 由调用方统一映射为通用 ORDER_CONFLICT（不向用户泄露其他账号信息）。
 */
export async function claimSpentOrder(
  tx: Pick<Prisma.TransactionClient, "$executeRaw" | "spentOrderClaim">,
  params: {
    userId: string;
    orderNo: string;
    orderNoKey: string;
    source: SpentOrderSource;
    reference: string;
    originalAmount?: number;
  }
): Promise<void> {
  if (typeof tx.$executeRaw !== "function") {
    // 测试/轻量 mock 回退：无并发保证，仅用于单元测试替身
    const existing = await tx.spentOrderClaim.findUnique({
      where: { orderNoKey: params.orderNoKey },
      select: { source: true },
    });
    if (existing) {
      throw new SpentOrderConflictError(params.orderNoKey, existing.source);
    }
    await tx.spentOrderClaim.create({
      data: {
        userId: params.userId,
        orderNo: params.orderNo,
        orderNoKey: params.orderNoKey,
        source: params.source,
        reference: params.reference,
        originalAmount: params.originalAmount ?? null,
      },
    });
    return;
  }

  const inserted = await tx.$executeRaw`
    INSERT INTO "SpentOrderClaim" ("id", "userId", "orderNo", "orderNoKey", "source", "reference", "originalAmount", "createdAt")
    VALUES (
      ${randomUUID()},
      ${params.userId},
      ${params.orderNo},
      ${params.orderNoKey},
      ${params.source}::"SpentOrderSource",
      ${params.reference},
      ${params.originalAmount ?? null},
      ${new Date()}
    )
    ON CONFLICT ("orderNoKey") DO NOTHING
  `;

  if (inserted > 0) return;

  const existing = await tx.spentOrderClaim.findUnique({
    where: { orderNoKey: params.orderNoKey },
    select: { source: true },
  });
  throw new SpentOrderConflictError(params.orderNoKey, existing?.source ?? params.source);
}

export async function releaseSpentOrderClaim(
  tx: Pick<Prisma.TransactionClient, "spentOrderClaim">,
  params: {
    userId: string;
    orderNoKey: string | null | undefined;
    source?: SpentOrderSource;
    reference?: string;
    referencePrefix?: string;
    force?: boolean;
  }
): Promise<boolean> {
  if (!params.orderNoKey || !tx.spentOrderClaim) return false;

  const where = {
    userId: params.userId,
    orderNoKey: params.orderNoKey,
    ...(params.source ? { source: params.source } : {}),
    ...(params.reference ? { reference: params.reference } : {}),
    ...(params.referencePrefix ? { reference: { startsWith: params.referencePrefix } } : {}),
  };

  if (!params.force) {
    const claim = await tx.spentOrderClaim.findUnique({
      where: { orderNoKey: params.orderNoKey },
      select: { userId: true, source: true, reference: true, refundedAmount: true },
    });
    if (!claim) return false;
    if (
      claim.userId !== params.userId ||
      (params.source && claim.source !== params.source) ||
      (params.reference && claim.reference !== params.reference) ||
      (params.referencePrefix && !claim.reference.startsWith(params.referencePrefix))
    ) {
      return false;
    }
    if (claim.refundedAmount > 0) {
      throw new SpentOrderHasRefundsError(params.orderNoKey);
    }
  }

  const deleted = await tx.spentOrderClaim.deleteMany({ where });
  return deleted.count > 0;
}

export async function reserveSpentOrderRefund(
  tx: Pick<Prisma.TransactionClient, "spentOrderClaim">,
  params: { userId: string; orderNoKey: string; amount: number }
): Promise<void> {
  if (params.amount <= 0) return;

  const claim = await tx.spentOrderClaim.findUnique({
    where: { orderNoKey: params.orderNoKey },
    select: {
      id: true,
      userId: true,
      originalAmount: true,
      refundedAmount: true,
    },
  });
  if (!claim || claim.userId !== params.userId || claim.originalAmount === null) {
    throw new SpentRefundNotLinkedError(params.orderNoKey);
  }
  if (claim.refundedAmount + params.amount > claim.originalAmount) {
    throw new SpentRefundExceedsOriginalError(params.orderNoKey);
  }

  const updated = await tx.spentOrderClaim.updateMany({
    where: { id: claim.id, refundedAmount: claim.refundedAmount },
    data: { refundedAmount: { increment: params.amount } },
  });
  if (updated.count !== 1) {
    throw new SpentRefundReservationConflictError(params.orderNoKey);
  }
}

export async function releaseSpentOrderRefund(
  tx: Pick<Prisma.TransactionClient, "spentOrderClaim">,
  params: { userId: string; orderNoKey: string; amount: number }
): Promise<void> {
  if (params.amount <= 0) return;
  const claim = await tx.spentOrderClaim.findUnique({
    where: { orderNoKey: params.orderNoKey },
    select: { id: true, userId: true, refundedAmount: true },
  });
  if (!claim || claim.userId !== params.userId || claim.refundedAmount < params.amount) {
    throw new SpentRefundReservationConflictError(params.orderNoKey);
  }
  const updated = await tx.spentOrderClaim.updateMany({
    where: { id: claim.id, refundedAmount: claim.refundedAmount },
    data: { refundedAmount: { decrement: params.amount } },
  });
  if (updated.count !== 1) {
    throw new SpentRefundReservationConflictError(params.orderNoKey);
  }
}
