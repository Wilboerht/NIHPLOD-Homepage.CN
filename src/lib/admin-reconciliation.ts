/**
 * 管理端对账中心（只读）
 *
 * 汇总四类巡检，不修改任何数据：
 * - 积分余额与发放流水 remaining 是否一致
 * - 积分兑换记录与 REDEEM / 取消退分流水是否一一对应
 * - 用户累计消费与 SpentSyncRecord 变动合计是否一致
 * - 消费订单占用、退款占用、重复退款行与跨来源订单冲突
 */
import { prisma } from "@/lib/prisma";
import { checkPointInvariants, type PointInvariantResult } from "@/lib/points-invariants";
import {
  findSpentOrderConflicts,
  type SpentOrderConflictResult,
} from "@/lib/spent-order-conflicts";

export interface CappedResult<T> {
  items: T[];
  count: number;
  truncated: boolean;
}

export interface PointRedemptionLinkIssue {
  kind:
    | "MISSING_REDEEM"
    | "REDEEM_AMOUNT_MISMATCH"
    | "ORPHAN_REDEEM"
    | "MISSING_CANCEL_REFUND"
    | "CANCEL_REFUND_MISMATCH"
    | "ORPHAN_CANCEL_REFUND"
    | "MISSING_AFTER_SALES_REFUND"
    | "AFTER_SALES_REFUND_MISMATCH"
    | "ORPHAN_AFTER_SALES_REFUND";
  redemptionId: string | null;
  ledgerId: string | null;
  userId: string;
  reference: string;
  status: string | null;
  points: number | null;
  ledgerAmount: number | null;
  happenedAt: Date | null;
}

export interface SpentTotalMismatch {
  userId: string;
  totalSpent: number;
  ledgerTotal: number;
  diff: number;
  kind: "MISSING_LEDGER" | "AMOUNT_MISMATCH";
}

export interface SpentClaimIssue {
  orderNoKey: string;
  userId: string;
  source: string;
  originalAmount: number | null;
  refundedAmount: number;
  importRefunded: number;
  kind: "OVER_REFUNDED" | "UNLINKED_REFUND" | "REFUND_MISMATCH";
}

export interface DuplicateRefundRow {
  userId: string;
  syncReference: string;
  count: number;
  total: number;
}

export interface UnlinkedRefundRow {
  id: string;
  userId: string | null;
  orderNoKey: string | null;
  amount: number;
  appliedDelta: number | null;
  createdAt: Date;
}

export interface ReconciliationReport {
  generatedAt: string;
  scope: { limit: number; sinceDays: number };
  summary: {
    totalIssueCount: number;
    pointIssueCount: number;
    spentIssueCount: number;
    hasIssues: boolean;
    truncated: boolean;
  };
  points: {
    invariants: PointInvariantResult;
    redemptionLinks: CappedResult<PointRedemptionLinkIssue>;
  };
  spent: {
    totalMismatches: CappedResult<SpentTotalMismatch>;
    claimIssues: CappedResult<SpentClaimIssue>;
    duplicateRefundRows: CappedResult<DuplicateRefundRow>;
    unlinkedRefunds: CappedResult<UnlinkedRefundRow>;
    crossSourceConflicts: SpentOrderConflictResult;
  };
}

function normalizeLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return 100;
  return Math.min(300, Math.max(1, Math.floor(value as number)));
}

function normalizeSinceDays(value: number | undefined): number {
  if (!Number.isFinite(value)) return 90;
  return Math.min(365, Math.max(1, Math.floor(value as number)));
}

function capRows<T>(rows: T[], take: number): CappedResult<T> {
  return {
    items: rows.slice(0, take),
    count: Math.min(rows.length, take),
    truncated: rows.length > take,
  };
}

export async function findPointRedemptionLinkIssues(
  limit = 100
): Promise<CappedResult<PointRedemptionLinkIssue>> {
  const take = normalizeLimit(limit);
  const rows = await prisma.$queryRaw<PointRedemptionLinkIssue[]>`
    WITH issues AS (
      SELECT
        'MISSING_REDEEM'::text AS kind,
        r."id" AS "redemptionId",
        NULL::text AS "ledgerId",
        r."userId" AS "userId",
        r."reference" AS "reference",
        r."status"::text AS "status",
        r."points" AS "points",
        NULL::int AS "ledgerAmount",
        r."createdAt" AS "happenedAt"
      FROM "PointRedemption" r
      LEFT JOIN "PointLedger" pl
        ON pl."userId" = r."userId"
       AND pl."reference" = r."reference"
       AND pl."type" = 'REDEEM'
      WHERE pl."id" IS NULL

      UNION ALL

      SELECT
        'REDEEM_AMOUNT_MISMATCH'::text,
        r."id",
        pl."id",
        r."userId",
        r."reference",
        r."status"::text,
        r."points",
        pl."amount",
        r."createdAt"
      FROM "PointRedemption" r
      JOIN "PointLedger" pl
        ON pl."userId" = r."userId"
       AND pl."reference" = r."reference"
       AND pl."type" = 'REDEEM'
      WHERE pl."amount" <> -r."points"

      UNION ALL

      SELECT
        'ORPHAN_REDEEM'::text,
        NULL::text,
        pl."id",
        pl."userId",
        pl."reference",
        NULL::text,
        NULL::int,
        pl."amount",
        pl."createdAt"
      FROM "PointLedger" pl
      LEFT JOIN "PointRedemption" r
        ON r."userId" = pl."userId"
       AND r."reference" = pl."reference"
      WHERE pl."type" = 'REDEEM'
        AND r."id" IS NULL

      UNION ALL

      SELECT
        'MISSING_CANCEL_REFUND'::text,
        r."id",
        NULL::text,
        r."userId",
        'cancel:' || r."id",
        r."status"::text,
        r."points",
        NULL::int,
        COALESCE(r."cancelledAt", r."createdAt")
      FROM "PointRedemption" r
      JOIN "User" u ON u."id" = r."userId"
      LEFT JOIN "PointLedger" pl
        ON pl."userId" = r."userId"
       AND pl."reference" = 'cancel:' || r."id"
       AND pl."type" = 'ADJUST'
      WHERE r."status" = 'CANCELLED'
        AND u."status" <> 'DELETED'
        AND pl."id" IS NULL

      UNION ALL

      SELECT
        'CANCEL_REFUND_MISMATCH'::text,
        r."id",
        pl."id",
        r."userId",
        pl."reference",
        r."status"::text,
        r."points",
        pl."amount",
        COALESCE(r."cancelledAt", r."createdAt")
      FROM "PointRedemption" r
      JOIN "User" u ON u."id" = r."userId"
      JOIN "PointLedger" pl
        ON pl."userId" = r."userId"
       AND pl."reference" = 'cancel:' || r."id"
       AND pl."type" = 'ADJUST'
      WHERE r."status" = 'CANCELLED'
        AND u."status" <> 'DELETED'
        AND pl."amount" <> r."points"

      UNION ALL

      SELECT
        'ORPHAN_CANCEL_REFUND'::text,
        NULL::text,
        pl."id",
        pl."userId",
        pl."reference",
        NULL::text,
        NULL::int,
        pl."amount",
        pl."createdAt"
      FROM "PointLedger" pl
      WHERE pl."type" = 'ADJUST'
        AND pl."reference" LIKE 'cancel:%'
        AND NOT EXISTS (
          SELECT 1
          FROM "PointRedemption" r
          WHERE r."userId" = pl."userId"
            AND 'cancel:' || r."id" = pl."reference"
        )

      UNION ALL

      SELECT
        'MISSING_AFTER_SALES_REFUND'::text,
        r."id",
        NULL::text,
        r."userId",
        'after-sales-refund:' || r."id",
        r."status"::text,
        r."points",
        NULL::int,
        COALESCE(r."refundedAt", r."createdAt")
      FROM "PointRedemption" r
      JOIN "User" u ON u."id" = r."userId"
      LEFT JOIN "PointLedger" pl
        ON pl."userId" = r."userId"
       AND pl."reference" = 'after-sales-refund:' || r."id"
       AND pl."type" = 'ADJUST'
      WHERE r."status" = 'REFUNDED'
        AND u."status" <> 'DELETED'
        AND pl."id" IS NULL

      UNION ALL

      SELECT
        'AFTER_SALES_REFUND_MISMATCH'::text,
        r."id",
        pl."id",
        r."userId",
        pl."reference",
        r."status"::text,
        r."points",
        pl."amount",
        COALESCE(r."refundedAt", r."createdAt")
      FROM "PointRedemption" r
      JOIN "User" u ON u."id" = r."userId"
      JOIN "PointLedger" pl
        ON pl."userId" = r."userId"
       AND pl."reference" = 'after-sales-refund:' || r."id"
       AND pl."type" = 'ADJUST'
      WHERE r."status" = 'REFUNDED'
        AND u."status" <> 'DELETED'
        AND pl."amount" <> r."points"

      UNION ALL

      SELECT
        'ORPHAN_AFTER_SALES_REFUND'::text,
        NULL::text,
        pl."id",
        pl."userId",
        pl."reference",
        NULL::text,
        NULL::int,
        pl."amount",
        pl."createdAt"
      FROM "PointLedger" pl
      WHERE pl."type" = 'ADJUST'
        AND pl."reference" LIKE 'after-sales-refund:%'
        AND NOT EXISTS (
          SELECT 1
          FROM "PointRedemption" r
          WHERE r."userId" = pl."userId"
            AND 'after-sales-refund:' || r."id" = pl."reference"
        )
    )
    SELECT *
    FROM issues
    ORDER BY "happenedAt" DESC NULLS LAST
    LIMIT ${take + 1}
  `;
  return capRows(rows, take);
}

export async function findSpentTotalMismatches(
  limit = 100
): Promise<CappedResult<SpentTotalMismatch>> {
  const take = normalizeLimit(limit);
  const rows = await prisma.$queryRaw<SpentTotalMismatch[]>`
    WITH ledger AS (
      SELECT "userId", COALESCE(SUM("spentDelta"), 0)::int AS total
      FROM "SpentSyncRecord"
      GROUP BY "userId"
    )
    SELECT
      u."id" AS "userId",
      u."totalSpent" AS "totalSpent",
      COALESCE(l.total, 0)::int AS "ledgerTotal",
      (u."totalSpent" - COALESCE(l.total, 0))::int AS "diff",
      CASE
        WHEN l."userId" IS NULL AND u."totalSpent" <> 0 THEN 'MISSING_LEDGER'
        ELSE 'AMOUNT_MISMATCH'
      END AS "kind"
    FROM "User" u
    LEFT JOIN ledger l ON l."userId" = u."id"
    WHERE u."totalSpent" <> COALESCE(l.total, 0)
    ORDER BY ABS(u."totalSpent" - COALESCE(l.total, 0)) DESC, u."id"
    LIMIT ${take + 1}
  `;
  return capRows(rows, take);
}

export async function findSpentClaimIssues(limit = 100): Promise<CappedResult<SpentClaimIssue>> {
  const take = normalizeLimit(limit);
  const rows = await prisma.$queryRaw<SpentClaimIssue[]>`
    WITH refunds AS (
      SELECT
        "orderNoKey",
        COALESCE(SUM(-COALESCE("appliedDelta", "amount")), 0)::int AS refunded
      FROM "SpentImportRow"
      WHERE "status" = 'SUCCESS'
        AND "revertedAt" IS NULL
        AND "amount" < 0
        AND "orderNoKey" IS NOT NULL
      GROUP BY "orderNoKey"
    )
    SELECT
      c."orderNoKey" AS "orderNoKey",
      c."userId" AS "userId",
      c."source"::text AS "source",
      c."originalAmount" AS "originalAmount",
      c."refundedAmount" AS "refundedAmount",
      COALESCE(r.refunded, 0)::int AS "importRefunded",
      CASE
        WHEN c."originalAmount" IS NULL AND c."refundedAmount" > 0 THEN 'UNLINKED_REFUND'
        WHEN c."originalAmount" IS NOT NULL AND c."refundedAmount" > c."originalAmount" THEN 'OVER_REFUNDED'
        ELSE 'REFUND_MISMATCH'
      END AS "kind"
    FROM "SpentOrderClaim" c
    LEFT JOIN refunds r ON r."orderNoKey" = c."orderNoKey"
    WHERE (c."originalAmount" IS NULL AND c."refundedAmount" > 0)
       OR (c."originalAmount" IS NOT NULL AND c."refundedAmount" > c."originalAmount")
       OR (
         c."originalAmount" IS NOT NULL
         AND c."refundedAmount" <> COALESCE(r.refunded, 0)
       )
    ORDER BY c."orderNoKey"
    LIMIT ${take + 1}
  `;
  return capRows(rows, take);
}

export async function findDuplicateRefundRows(
  limit = 100
): Promise<CappedResult<DuplicateRefundRow>> {
  const take = normalizeLimit(limit);
  const rows = await prisma.$queryRaw<
    { userId: string; syncReference: string; count: bigint; total: number }[]
  >`
    SELECT
      "userId",
      "syncReference",
      COUNT(*)::bigint AS count,
      COALESCE(SUM("appliedDelta"), 0)::int AS total
    FROM "SpentImportRow"
    WHERE "status" = 'SUCCESS'
      AND "revertedAt" IS NULL
      AND "amount" < 0
      AND "syncReference" IS NOT NULL
    GROUP BY "userId", "syncReference"
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC, "userId", "syncReference"
    LIMIT ${take + 1}
  `;
  return capRows(
    rows.map((row) => ({
      userId: row.userId,
      syncReference: row.syncReference,
      count: Number(row.count),
      total: Number(row.total),
    })),
    take
  );
}

export async function findUnlinkedRefundRows(
  limit = 100
): Promise<CappedResult<UnlinkedRefundRow>> {
  const take = normalizeLimit(limit);
  const rows = await prisma.$queryRaw<UnlinkedRefundRow[]>`
    SELECT
      r."id" AS "id",
      r."userId" AS "userId",
      r."orderNoKey" AS "orderNoKey",
      r."amount" AS "amount",
      r."appliedDelta" AS "appliedDelta",
      r."createdAt" AS "createdAt"
    FROM "SpentImportRow" r
    LEFT JOIN "SpentOrderClaim" c ON c."orderNoKey" = r."orderNoKey"
    WHERE r."status" = 'SUCCESS'
      AND r."revertedAt" IS NULL
      AND r."amount" < 0
      AND (
        c."id" IS NULL
        OR c."userId" IS DISTINCT FROM r."userId"
        OR c."originalAmount" IS NULL
      )
    ORDER BY r."createdAt" DESC
    LIMIT ${take + 1}
  `;
  return capRows(rows, take);
}

export async function runAdminReconciliation(
  options: { limit?: number; sinceDays?: number } = {}
): Promise<ReconciliationReport> {
  const limit = normalizeLimit(options.limit);
  const sinceDays = normalizeSinceDays(options.sinceDays);

  const [
    invariants,
    redemptionLinks,
    totalMismatches,
    claimIssues,
    duplicateRefundRows,
    unlinkedRefunds,
    crossSourceConflicts,
  ] = await Promise.all([
    checkPointInvariants(limit),
    findPointRedemptionLinkIssues(limit),
    findSpentTotalMismatches(limit),
    findSpentClaimIssues(limit),
    findDuplicateRefundRows(limit),
    findUnlinkedRefundRows(limit),
    findSpentOrderConflicts({ sinceDays, limit }),
  ]);

  const pointIssueCount =
    invariants.issues.length +
    invariants.negativeBalances +
    invariants.deletedUsersWithRemaining +
    redemptionLinks.count;
  const spentIssueCount =
    totalMismatches.count +
    claimIssues.count +
    duplicateRefundRows.count +
    unlinkedRefunds.count +
    crossSourceConflicts.count;
  const totalIssueCount = pointIssueCount + spentIssueCount;
  const truncated =
    invariants.truncated ||
    redemptionLinks.truncated ||
    totalMismatches.truncated ||
    claimIssues.truncated ||
    duplicateRefundRows.truncated ||
    unlinkedRefunds.truncated ||
    crossSourceConflicts.truncated;

  return {
    generatedAt: new Date().toISOString(),
    scope: { limit, sinceDays },
    summary: {
      totalIssueCount,
      pointIssueCount,
      spentIssueCount,
      hasIssues: totalIssueCount > 0,
      truncated,
    },
    points: {
      invariants,
      redemptionLinks,
    },
    spent: {
      totalMismatches,
      claimIssues,
      duplicateRefundRows,
      unlinkedRefunds,
      crossSourceConflicts,
    },
  };
}
