import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

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
  issues: PointInvariantIssue[];
  truncated: boolean;
}

export async function checkPointInvariants(limit = 200): Promise<PointInvariantResult> {
  const take = Math.min(1000, Math.max(1, limit));
  const [checked, negative, deletedUsersWithRemaining] = await Promise.all([
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
       OR (COALESCE(r.remaining, 0) > 0 AND pb."available" <> COALESCE(r.remaining, 0))
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
    issues: issues.slice(0, take),
    truncated: rows.length + missing.length > take,
  };
}
