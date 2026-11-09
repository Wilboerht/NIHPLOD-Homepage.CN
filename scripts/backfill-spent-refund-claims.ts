/**
 * 回填 SpentOrderClaim 的原始金额与累计退款金额。
 *
 * 用法：
 *   npx tsx scripts/backfill-spent-refund-claims.ts
 *   npx tsx scripts/backfill-spent-refund-claims.ts --apply --confirm=APPLY
 */
import "./load-env";
import { prisma } from "@/lib/prisma";

const APPLY = process.argv.includes("--apply");
const CONFIRM = process.argv.includes("--confirm=APPLY");
const ALLOWED = process.env.ALLOW_DATA_REPAIR === "true";

async function main() {
  if (APPLY && (!CONFIRM || !ALLOWED)) {
    console.error(
      "拒绝执行：--apply 需要同时传入 --confirm=APPLY 并设置 ALLOW_DATA_REPAIR=true"
    );
    process.exitCode = 1;
    return;
  }

  const [missingOriginal, existingRefundTotals] = await Promise.all([
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "SpentOrderClaim" c
      WHERE c."originalAmount" IS NULL
        AND EXISTS (
          SELECT 1 FROM "SpentSyncRecord" s
          WHERE s."orderNoKey" = c."orderNoKey"
            AND s."spentDelta" > 0
            AND s."revertedAt" IS NULL
        )
    `,
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "SpentOrderClaim" c
      WHERE EXISTS (
        SELECT 1 FROM "SpentSyncRecord" s
        WHERE s."orderNoKey" = c."orderNoKey"
          AND s."spentDelta" < 0
          AND s."revertedAt" IS NULL
      )
    `,
  ]);

  console.log(
    `[spent-claim-backfill] ${APPLY ? "执行" : "dry-run"}：可回填 originalAmount 的 claim=${Number(missingOriginal[0]?.count ?? 0)}，存在退款记录的 claim=${Number(existingRefundTotals[0]?.count ?? 0)}`
  );

  if (!APPLY) {
    console.log("[spent-claim-backfill] dry-run 完成，未写入任何数据");
    return;
  }

  const originalUpdated = await prisma.$executeRaw`
    UPDATE "SpentOrderClaim" c
    SET "originalAmount" = sub.amount
    FROM (
      SELECT "orderNoKey", SUM("spentDelta")::int AS amount
      FROM "SpentSyncRecord"
      WHERE "spentDelta" > 0
        AND "revertedAt" IS NULL
        AND "orderNoKey" IS NOT NULL
      GROUP BY "orderNoKey"
    ) sub
    WHERE c."orderNoKey" = sub."orderNoKey"
      AND c."originalAmount" IS NULL
  `;

  const refundUpdated = await prisma.$executeRaw`
    UPDATE "SpentOrderClaim" c
    SET "refundedAmount" = COALESCE(sub.amount, 0)
    FROM (
      SELECT "orderNoKey", SUM(-"spentDelta")::int AS amount
      FROM "SpentSyncRecord"
      WHERE "spentDelta" < 0
        AND "revertedAt" IS NULL
        AND "orderNoKey" IS NOT NULL
      GROUP BY "orderNoKey"
    ) sub
    WHERE c."orderNoKey" = sub."orderNoKey"
  `;

  console.log(
    `[spent-claim-backfill] 完成：originalAmount 更新 ${originalUpdated} 行，refundedAmount 更新 ${refundUpdated} 行`
  );
}

main()
  .catch((error) => {
    console.error("[spent-claim-backfill] 失败:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
