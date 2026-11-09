/**
 * 只读检查消费导入退款重复/超限/未绑定原始订单。
 *
 * 用法：npx tsx scripts/audit-spent-refund-duplicates.ts
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { findSpentOrderConflicts } from "@/lib/spent-order-conflicts";

async function main() {
  const [duplicateContents, overRefundedClaims, unlinkedRefunds, conflicts] = await Promise.all([
    prisma.$queryRaw<
      {
        userId: string;
        syncReference: string;
        count: bigint;
        total: number;
      }[]
    >`
      SELECT "userId", "syncReference", COUNT(*)::bigint AS count,
             SUM("appliedDelta")::int AS total
      FROM "SpentImportRow"
      WHERE "status" = 'SUCCESS'
        AND "revertedAt" IS NULL
        AND "syncReference" IS NOT NULL
      GROUP BY "userId", "syncReference"
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
      LIMIT 200
    `,
    prisma.$queryRaw<
      {
        orderNoKey: string;
        userId: string;
        originalAmount: number | null;
        refundedAmount: number;
      }[]
    >`
      SELECT "orderNoKey", "userId", "originalAmount", "refundedAmount"
      FROM "SpentOrderClaim"
      WHERE "originalAmount" IS NOT NULL
        AND "refundedAmount" > "originalAmount"
      LIMIT 200
    `,
    prisma.$queryRaw<
      {
        id: string;
        userId: string | null;
        orderNoKey: string | null;
        amount: number;
        appliedDelta: number | null;
      }[]
    >`
      SELECT r."id", r."userId", r."orderNoKey", r."amount", r."appliedDelta"
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
      LIMIT 200
    `,
    findSpentOrderConflicts({ sinceDays: 365, limit: 200 }),
  ]);

  const report = {
    duplicateContents: duplicateContents.map((row) => ({
      userId: row.userId,
      syncReference: row.syncReference,
      count: Number(row.count),
      total: Number(row.total),
    })),
    overRefundedClaims,
    unlinkedRefunds,
    crossSourceConflicts: {
      count: conflicts.count,
      truncated: conflicts.truncated,
    },
    issueCount:
      duplicateContents.length +
      overRefundedClaims.length +
      unlinkedRefunds.length +
      conflicts.count,
  };

  console.log(JSON.stringify(report, null, 2));
  if (report.issueCount > 0) {
    console.error(`发现 ${report.issueCount} 个消费退款/订单冲突问题，请人工核对`);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("[spent-refund-audit] 失败:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
