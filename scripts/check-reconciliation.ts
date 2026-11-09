/**
 * 对账中心巡检（只读）
 *
 * 用法：
 *   npx tsx scripts/check-reconciliation.ts
 *   npx tsx scripts/check-reconciliation.ts --limit=200 --since-days=90
 *
 * 发现异常时退出码为 1，方便外部巡检接入。
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { runAdminReconciliation } from "@/lib/admin-reconciliation";

function readNumberArg(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

async function main() {
  const report = await runAdminReconciliation({
    limit: readNumberArg("limit", 100),
    sinceDays: readNumberArg("since-days", 90),
  });

  console.log(JSON.stringify(report, null, 2));
  if (report.summary.hasIssues) {
    console.error(
      `发现 ${report.summary.totalIssueCount} 个对账异常（积分 ${report.summary.pointIssueCount}，消费 ${report.summary.spentIssueCount}）`
    );
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("[reconciliation] 巡检失败:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
