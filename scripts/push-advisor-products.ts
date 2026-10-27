/**
 * 主站产品 → 测肤子站 全量同步（每日兜底 / 首次绑定 / 手动执行）
 *
 * 用法：
 *   npx tsx scripts/push-advisor-products.ts
 *   npx tsx scripts/push-advisor-products.ts --dry-run
 *   npx tsx scripts/push-advisor-products.ts --bind-by-name --dry-run
 *   npx tsx scripts/push-advisor-products.ts --bind-by-name
 *   npx tsx scripts/push-advisor-products.ts --force
 *
 * 说明：
 * - 读取主站 Prisma Product，构建全量快照后推送到子站内部接口；
 * - --dry-run 只让子站返回变更计划，不写库；
 * - --bind-by-name 仅首次同步使用，按同名绑定子站已有产品；
 * - --force 用于产品数量骤降/空目录等保护被触发时的人工确认。
 */
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const bindByName = args.has("--bind-by-name");
const force = args.has("--force");

async function main() {
  const [{ pushAdvisorProductSnapshot }, { prisma }] = await Promise.all([
    import("../src/lib/advisor-product-sync"),
    import("../src/lib/prisma"),
  ]);

  try {
    const result = await pushAdvisorProductSnapshot({
      trigger: "daily",
      dryRun,
      bindByName,
      force,
    });

    console.log(
      JSON.stringify(
        {
          dryRun,
          bindByName,
          force,
          ...result,
        },
        null,
        2
      )
    );

    if (!result.ok) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(
    "[push-advisor-products] 同步失败：",
    error instanceof Error ? error.message : error
  );
  process.exitCode = 1;
});
