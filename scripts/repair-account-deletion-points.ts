/**
 * 修复已注销用户的积分账本残留。
 *
 * 背景：历史注销逻辑只清零 PointBalance，没有清零 PointLedger.remaining，
 * 导致过期任务继续扣减已注销用户余额，最终形成负余额并污染对账。
 *
 * 用法：
 *   npx tsx scripts/repair-account-deletion-points.ts
 *   npx tsx scripts/repair-account-deletion-points.ts --apply --confirm=APPLY
 *
 * 默认 dry-run；--apply 需要同时设置 ALLOW_DATA_REPAIR=true。
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { voidPointsForDeletedUser } from "@/lib/points-ledger";
import { apiConsole } from "@/lib/logger";

const APPLY = process.argv.includes("--apply");
const CONFIRM = process.argv.includes("--confirm=APPLY");
const ALLOWED = process.env.ALLOW_DATA_REPAIR === "true";

async function findCandidates() {
  return prisma.$queryRaw<
    {
      userId: string;
      available: number;
      frozen: number;
      remaining: number;
    }[]
  >`
    SELECT
      u."id" AS "userId",
      COALESCE(pb."available", 0)::int AS available,
      COALESCE(pb."frozen", 0)::int AS frozen,
      COALESCE((
        SELECT SUM(pl."remaining")::int
        FROM "PointLedger" pl
        WHERE pl."userId" = u."id" AND pl."remaining" > 0
      ), 0)::int AS remaining
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
    ORDER BY u."id"
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

  const candidates = await findCandidates();
  console.log(
    `[account-deletion-points] ${APPLY ? "执行" : "dry-run"}：发现 ${candidates.length} 个候选用户`
  );
  for (const item of candidates) {
    console.log(
      `[candidate] userId=${item.userId} available=${item.available} frozen=${item.frozen} remaining=${item.remaining}`
    );
  }

  if (!APPLY) {
    console.log("[account-deletion-points] dry-run 完成，未写入任何数据");
    return;
  }

  let repaired = 0;
  let failed = 0;

  for (const item of candidates) {
    const auditId = await beginAuditLog({
      action: "account_deletion_points_repair",
      targetType: "user",
      targetId: item.userId,
      detail: {
        before: {
          available: item.available,
          frozen: item.frozen,
          remaining: item.remaining,
        },
      },
      actorType: "SYSTEM",
    });
    if (!auditId) {
      failed += 1;
      console.error(`[account-deletion-points] 审计不可用，跳过 userId=${item.userId}`);
      continue;
    }

    try {
      const result = await prisma.$transaction((tx) =>
        voidPointsForDeletedUser(tx, item.userId, `repair:account-deletion-points:${item.userId}`)
      );
      await finishAuditLog(auditId, "SUCCESS", {
        before: {
          available: item.available,
          frozen: item.frozen,
          remaining: item.remaining,
        },
        after: {
          available: 0,
          frozen: 0,
          remaining: 0,
        },
        clearedGrants: result.clearedGrants,
      });
      repaired += 1;
      console.log(
        `[account-deletion-points] 已修复 userId=${item.userId} clearedGrants=${result.clearedGrants}`
      );
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      await finishAuditLog(auditId, "FAILURE", { error: message.slice(0, 500) });
      console.error(`[account-deletion-points] 修复失败 userId=${item.userId}:`, message);
    }
  }

  console.log(`[account-deletion-points] 完成：修复 ${repaired}，失败 ${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    apiConsole.error("[account-deletion-points] 脚本异常:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
