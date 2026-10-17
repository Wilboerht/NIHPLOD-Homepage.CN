/**
 * 一次性数据维护：积分冻结机制废弃后的历史残留清理
 *
 * 背景：2026-09 积分规则改版后取消冻结期（发放即到账），PointBalance.frozen 字段
 * 已废弃恒为 0；历史数据中可能残留冻结余额与未释放（releasedAt = null）的发放流水。
 *
 * 清理口径：
 * 1. PointBalance.frozen：清零（该部分积分从未对用户可用，按废弃字段处理）
 * 2. PointLedger 中未释放且 remaining > 0 的历史发放流水：remaining 清零
 *    （避免后续过期任务为"从未可用积分"生成 EXPIRE 记账噪声）
 *
 * 默认 dry-run（只统计不写入）；确认后加 --apply 执行。
 * 运行：npx tsx scripts/cleanup-frozen-points.ts [--apply]
 */
import dotenv from "dotenv";

dotenv.config({ path: ".env.production.local" });
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env.production" });
dotenv.config({ path: ".env" });

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  // 动态导入：确保 dotenv 已加载后再初始化 Prisma
  const { prisma } = await import("@/lib/prisma");

  try {
    const [frozenBalances, legacyRows] = await Promise.all([
      prisma.pointBalance.findMany({
        where: { frozen: { not: 0 } },
        select: { userId: true, frozen: true },
      }),
      prisma.pointLedger.findMany({
        where: { releasedAt: null, remaining: { gt: 0 } },
        select: { id: true, userId: true, remaining: true },
      }),
    ]);

    const frozenSum = frozenBalances.reduce((sum, row) => sum + row.frozen, 0);
    const legacySum = legacyRows.reduce((sum, row) => sum + (row.remaining ?? 0), 0);

    console.log("[cleanup-frozen-points] 冻结余额记录数:", frozenBalances.length, "合计积分:", frozenSum);
    console.log("[cleanup-frozen-points] 历史未释放流水数:", legacyRows.length, "合计剩余积分:", legacySum);

    if (!apply) {
      console.log("[cleanup-frozen-points] dry-run 完成（未写入）。确认后执行：npx tsx scripts/cleanup-frozen-points.ts --apply");
      return;
    }

    const result = await prisma.$transaction([
      prisma.pointBalance.updateMany({
        where: { frozen: { not: 0 } },
        data: { frozen: 0 },
      }),
      prisma.pointLedger.updateMany({
        where: { releasedAt: null, remaining: { gt: 0 } },
        data: { remaining: 0 },
      }),
    ]);

    console.log(
      "[cleanup-frozen-points] 已清理：冻结余额",
      result[0].count,
      "条，历史未释放流水",
      result[1].count,
      "条"
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[cleanup-frozen-points] 执行失败:", error);
  process.exit(1);
});
