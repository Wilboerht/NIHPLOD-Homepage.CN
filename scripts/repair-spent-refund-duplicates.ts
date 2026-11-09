/**
 * 修复重复的负数退款导入行。
 *
 * 默认 dry-run；只处理同一 (userId, syncReference) 的重复负数成功行，
 * 保留最早一行，其余行冲正并标记为 DUPLICATE。
 *
 * 用法：
 *   npx tsx scripts/repair-spent-refund-duplicates.ts
 *   npx tsx scripts/repair-spent-refund-duplicates.ts --apply --confirm=APPLY
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { applyExternalSpentSync } from "@/lib/points";
import { releaseSpentOrderRefund } from "@/lib/spent-order";

const APPLY = process.argv.includes("--apply");
const CONFIRM = process.argv.includes("--confirm=APPLY");
const ALLOWED = process.env.ALLOW_DATA_REPAIR === "true";

interface DuplicateRow {
  id: string;
  userId: string | null;
  orderNoKey: string | null;
  syncReference: string | null;
  appliedDelta: number | null;
  createdAt: Date;
}

async function findDuplicateRefundRows(): Promise<DuplicateRow[]> {
  return prisma.$queryRaw<DuplicateRow[]>`
    WITH ranked AS (
      SELECT
        r."id",
        r."userId",
        r."orderNoKey",
        r."syncReference",
        r."appliedDelta",
        r."createdAt",
        ROW_NUMBER() OVER (
          PARTITION BY r."userId", r."syncReference"
          ORDER BY r."createdAt" ASC, r."id" ASC
        ) AS rn
      FROM "SpentImportRow" r
      WHERE r."status" = 'SUCCESS'
        AND r."revertedAt" IS NULL
        AND r."amount" < 0
        AND r."syncReference" IS NOT NULL
    )
    SELECT "id", "userId", "orderNoKey", "syncReference", "appliedDelta", "createdAt"
    FROM ranked
    WHERE rn > 1
    ORDER BY "userId", "syncReference", "createdAt"
  `;
}

async function main() {
  if (APPLY && (!CONFIRM || !ALLOWED)) {
    console.error(
      "拒绝执行：--apply 需要同时传入 --confirm=APPLY 并设置 ALLOW_DATA_REPAIR=true"
    );
    process.exitCode = 1;
    return;
  }

  const rows = await findDuplicateRefundRows();
  console.log(
    `[spent-refund-repair] ${APPLY ? "执行" : "dry-run"}：发现 ${rows.length} 条重复退款行`
  );
  for (const row of rows) {
    console.log(
      `[duplicate] rowId=${row.id} userId=${row.userId} syncReference=${row.syncReference} appliedDelta=${row.appliedDelta}`
    );
  }

  if (!APPLY) {
    console.log("[spent-refund-repair] dry-run 完成，未写入任何数据");
    return;
  }

  let repaired = 0;
  let failed = 0;

  for (const row of rows) {
    if (!row.userId || !row.orderNoKey || !row.appliedDelta || row.appliedDelta >= 0) {
      failed += 1;
      console.error(`[spent-refund-repair] 行数据不完整，跳过 rowId=${row.id}`);
      continue;
    }

    const amount = Math.abs(row.appliedDelta);
    const auditId = await beginAuditLog({
      action: "undo_spent_import",
      targetType: "spent_import",
      targetId: row.id,
      detail: {
        repair: "duplicate_refund",
        rowId: row.id,
        userId: row.userId,
        orderNoKey: row.orderNoKey,
        amount,
      },
      actorType: "SYSTEM",
    });
    if (!auditId) {
      failed += 1;
      console.error(`[spent-refund-repair] 审计不可用，跳过 rowId=${row.id}`);
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        const synced = await applyExternalSpentSync(
          {
            userId: row.userId as string,
            spentDelta: amount,
            reference: `repair:duplicate-refund:${row.id}`,
            source: "SPENT_IMPORT",
            allowNegativeClamp: false,
            suppressWebhook: true,
            note: "修复重复退款行冲正",
          },
          tx
        );
        if (!synced) throw new Error("USER_MISSING");

        await releaseSpentOrderRefund(tx, {
          userId: row.userId as string,
          orderNoKey: row.orderNoKey as string,
          amount,
        });

        await tx.spentImportRow.update({
          where: { id: row.id },
          data: {
            status: "DUPLICATE",
            error: "重复退款行已由数据修复脚本冲正",
            revertedAt: new Date(),
          },
        });
      });

      await finishAuditLog(auditId, "SUCCESS", { rowId: row.id, amount });
      repaired += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      await finishAuditLog(auditId, "FAILURE", { rowId: row.id, error: message.slice(0, 500) });
      console.error(`[spent-refund-repair] 修复失败 rowId=${row.id}:`, message);
    }
  }

  console.log(`[spent-refund-repair] 完成：修复 ${repaired}，失败 ${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("[spent-refund-repair] 失败:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
