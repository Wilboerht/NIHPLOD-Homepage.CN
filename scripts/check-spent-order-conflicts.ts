/**
 * 消费订单跨来源冲突检查（只读）
 *
 * 用法：
 *   npx tsx scripts/check-spent-order-conflicts.ts
 *   npm run spent:check-conflicts
 *
 * 检查最近 90 天成功导入与已通过补录申请中重复的 (userId, orderNo)。
 * 发现冲突时退出码为 1，方便外部巡检接入。
 */
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

async function main(): Promise<void> {
  const [{ findSpentOrderConflicts }, { prisma }] = await Promise.all([
    import("@/lib/spent-order-conflicts"),
    import("@/lib/prisma"),
  ]);

  try {
    const result = await findSpentOrderConflicts({ sinceDays: 90, limit: 200 });
    console.log(
      JSON.stringify(
        {
          since: result.since,
          count: result.count,
          truncated: result.truncated,
          items: result.items.map((item) => ({
            userId: item.userId,
            orderNo: item.orderNo,
            importRowId: item.importRowId,
            importBatchId: item.importBatchId,
            importAmount: item.importAmount,
            importAppliedDelta: item.importAppliedDelta,
            importedAt: item.importedAt,
            applicationId: item.applicationId,
            adjustmentAmount: item.adjustmentAmount,
            adjustmentChannel: item.adjustmentChannel,
            reviewedAt: item.reviewedAt,
          })),
        },
        null,
        2
      )
    );
    if (result.count > 0) {
      console.error(`发现 ${result.count} 个跨来源订单冲突，请人工核对`);
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("订单冲突检查失败：", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
