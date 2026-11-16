import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { POINT_GRANT_LEDGER_TYPES } from "@/lib/points-ledger";

const GRANT_TYPES_SQL = Prisma.raw(`'CONSUME','BIRTHDAY','CHECKIN','ADJUST','REDEEM_REFUND'`);

export interface PointInvariantIssue {
  userId: string;
  available: number;
  remaining: number;
  kind:
    | "AVAILABLE_EXCEEDS_REMAINING"
    | "AVAILABLE_LESS_THAN_REMAINING"
    | "MISSING_BALANCE"
    | "NEGATIVE_REMAINING";
}

export interface PointInvariantResult {
  checked: number;
  negativeBalances: number;
  deletedUsersWithRemaining: number;
  /**
   * 历史冻结机制残留：未释放（releasedAt = null）但仍有剩余量的发放流水。
   * 这类流水不会被当前 FIFO 兑礼消耗，可能导致“余额有值但无法兑换”。
   */
  legacyUnreleasedGrants: number;
  /** 历史无到期时间的发放流水；当前过期任务/FIFO 都会忽略它们，需人工补数据。 */
  legacyMissingExpiryGrants: number;
  issues: PointInvariantIssue[];
  truncated: boolean;
}

export async function checkPointInvariants(limit = 200): Promise<PointInvariantResult> {
  const take = Math.min(1000, Math.max(1, limit));
  const [
    checked,
    negative,
    deletedUsersWithRemaining,
    legacyUnreleasedGrants,
    legacyMissingExpiryGrants,
  ] = await Promise.all([
    prisma.pointBalance.count(),
    prisma.pointBalance.count({ where: { available: { lt: 0 } } }),
    prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT u."id")::bigint AS count
        FROM "User" u
        LEFT JOIN "PointBalance" pb ON pb."userId" = u."id"
        WHERE u."status" = 'DELETED'
          AND (
            COALESCE(pb."available", 0) <> 0
            OR COALESCE(pb."frozen", 0) <> 0
            OR EXISTS (
              SELECT 1 FROM "PointLedger" pl
              WHERE pl."userId" = u."id" AND pl."remaining" > 0
            )
          )
      `,
    prisma.pointLedger.count({
      where: {
        type: { in: [...POINT_GRANT_LEDGER_TYPES] },
        remaining: { gt: 0 },
        releasedAt: null,
      },
    }),
    prisma.pointLedger.count({
      where: {
        type: { in: [...POINT_GRANT_LEDGER_TYPES] },
        remaining: { gt: 0 },
        expiresAt: null,
      },
    }),
  ]);

  const rows = await prisma.$queryRaw<
    { userId: string; available: number; remaining: number; kind: PointInvariantIssue["kind"] }[]
  >`
    WITH remaining AS (
      SELECT "userId", COALESCE(SUM("remaining"), 0)::int AS remaining
      FROM "PointLedger"
      WHERE "remaining" IS NOT NULL
        AND "type" IN (${GRANT_TYPES_SQL})
      GROUP BY "userId"
    )
    SELECT pb."userId", pb."available",
           COALESCE(r.remaining, 0)::int AS remaining,
           CASE
             WHEN COALESCE(r.remaining, 0) < 0 THEN 'NEGATIVE_REMAINING'
             WHEN pb."available" > COALESCE(r.remaining, 0) THEN 'AVAILABLE_EXCEEDS_REMAINING'
             ELSE 'AVAILABLE_LESS_THAN_REMAINING'
           END AS kind
    FROM "PointBalance" pb
    LEFT JOIN remaining r ON r."userId" = pb."userId"
    WHERE COALESCE(r.remaining, 0) < 0
       OR (COALESCE(r.remaining, 0) = 0 AND pb."available" > 0)
       -- available < remaining 是超兑债务的合法状态（负余额/先退款后发放），
       -- 不作为 actionable invariant；只有 available 超过 remaining 才是异常。
       OR pb."available" > COALESCE(r.remaining, 0)
    LIMIT ${take}
  `;

  const missing = await prisma.$queryRaw<
    { userId: string; available: number; remaining: number; kind: PointInvariantIssue["kind"] }[]
  >`
    SELECT pl."userId", 0::int AS available, SUM(pl."remaining")::int AS remaining,
           'MISSING_BALANCE'::text AS kind
    FROM "PointLedger" pl
    LEFT JOIN "PointBalance" pb ON pb."userId" = pl."userId"
    WHERE pb."id" IS NULL
      AND pl."remaining" > 0
      AND pl."type" IN (${GRANT_TYPES_SQL})
    GROUP BY pl."userId"
    LIMIT ${take}
  `;

  const issues = [...rows, ...missing] as PointInvariantIssue[];
  return {
    checked,
    negativeBalances: negative,
    deletedUsersWithRemaining: Number(deletedUsersWithRemaining[0]?.count ?? 0),
    legacyUnreleasedGrants,
    legacyMissingExpiryGrants,
    issues: issues.slice(0, take),
    truncated: rows.length + missing.length > take,
  };
}
