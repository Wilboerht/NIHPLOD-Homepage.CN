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
      ...(params.referencePrefix
        ? { reference: { startsWith: params.referencePrefix } }
        : {}),
    },
  });
}
