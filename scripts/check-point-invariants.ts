import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

async function main() {
  const [{ checkPointInvariants }, { prisma }] = await Promise.all([
    import("../src/lib/points-invariants"),
    import("../src/lib/prisma"),
  ]);
  try {
    const result = await checkPointInvariants();
    console.log(
      JSON.stringify(
        {
          checked: result.checked,
          negativeBalances: result.negativeBalances,
          issueCount: result.issues.length,
          truncated: result.truncated,
          issues: result.issues,
        },
        null,
        2
      )
    );
    if (result.issues.length > 0 || result.negativeBalances > 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[PointInvariants] 检查失败:", error);
  process.exitCode = 1;
});
