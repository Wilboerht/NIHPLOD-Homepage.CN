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
      },
    });
    return;
  }

  const inserted = await tx.$executeRaw`
    INSERT INTO "SpentOrderClaim" ("id", "userId", "orderNo", "orderNoKey", "source", "reference")
    VALUES (
      ${randomUUID()},
      ${params.userId},
      ${params.orderNo},
      ${params.orderNoKey},
      ${params.source}::"SpentOrderSource",
      ${params.reference}
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
  }
): Promise<void> {
  if (!params.orderNoKey || !tx.spentOrderClaim) return;
  await tx.spentOrderClaim.deleteMany({
    where: {
      userId: params.userId,
      orderNoKey: params.orderNoKey,
      ...(params.source ? { source: params.source } : {}),
      ...(params.reference ? { reference: params.reference } : {}),
      ...(params.referencePrefix ? { reference: { startsWith: params.referencePrefix } } : {}),
    },
  });
}
