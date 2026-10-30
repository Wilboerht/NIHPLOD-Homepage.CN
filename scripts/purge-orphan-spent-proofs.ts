/**
 * 清理未挂到任何消费补录申请上的本地私有凭证文件（孤儿文件）。
 *
 * 用法：
 *   npx tsx scripts/purge-orphan-spent-proofs.ts            # dry-run
 *   npx tsx scripts/purge-orphan-spent-proofs.ts --apply    # 实际删除
 *   npx tsx scripts/purge-orphan-spent-proofs.ts --days=7 --apply
 */
import "./load-env";

function readDaysArg(): number {
  const raw = process.argv.find((arg) => arg.startsWith("--days="));
  if (!raw) return 7;
  const value = Number(raw.slice("--days=".length));
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 7;
}

async function main(): Promise<void> {
  const { purgeOrphanSpentProofs } = await import("@/lib/spent-proof-orphans");
  const { prisma } = await import("@/lib/prisma");

  const apply = process.argv.includes("--apply");
  const days = readDaysArg();

  try {
    const result = await purgeOrphanSpentProofs({
      apply,
      olderThanMs: days * 24 * 60 * 60 * 1000,
    });
    console.log(
      JSON.stringify(
        {
          mode: apply ? "apply" : "dry-run",
          olderThanDays: days,
          ...result,
        },
        null,
        2
      )
    );
    if (result.errors > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("孤儿凭证清理失败：", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
