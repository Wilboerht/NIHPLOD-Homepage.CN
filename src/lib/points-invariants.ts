import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const GRANT_TYPES_SQL = Prisma.raw(`'CONSUME','BIRTHDAY','CHECKIN','ADJUST','REDEEM_REFUND'`);

export interface PointInvariantIssue {
  userId: string;
  available: number;
  remaining: number;
  kind: "AVAILABLE_EXCEEDS_REMAINING" | "MISSING_BALANCE" | "NEGATIVE_REMAINING";
}

export interface PointInvariantResult {
  checked: number;
  negativeBalances: number;
  issues: PointInvariantIssue[];
  truncated: boolean;
}

export async function checkPointInvariants(limit = 200): Promise<PointInvariantResult> {
  const take = Math.min(1000, Math.max(1, limit));
  const [checked, negative] = await Promise.all([
    prisma.pointBalance.count(),
    prisma.pointBalance.count({ where: { available: { lt: 0 } } }),
  ]);

  const rows = await prisma.$queryRaw<
    { userId: string; available: number; remaining: number; kind: PointInvariantIssue["kind"] }[]
  >`
    WITH remaining AS (
      SELECT "userId", COALESCE(SUM("remaining"), 0)::int AS remaining
      FROM "PointLedger"
      WHERE "remaining" > 0
        AND "type" IN (${GRANT_TYPES_SQL})
      GROUP BY "userId"
    )
    SELECT pb."userId", pb."available",
           COALESCE(r.remaining, 0)::int AS remaining,
           CASE
             WHEN pb."available" > COALESCE(r.remaining, 0) THEN 'AVAILABLE_EXCEEDS_REMAINING'
             ELSE 'NEGATIVE_REMAINING'
           END AS kind
    FROM "PointBalance" pb
    LEFT JOIN remaining r ON r."userId" = pb."userId"
    WHERE pb."available" > COALESCE(r.remaining, 0)
       OR COALESCE(r.remaining, 0) < 0
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
    issues: issues.slice(0, take),
    truncated: rows.length + missing.length > take,
  };
}
