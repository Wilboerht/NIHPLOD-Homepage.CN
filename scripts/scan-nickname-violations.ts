/**
 * 存量昵称合规扫描（本地词表，无外部 API）。
 *
 * 用法：
 *   npx tsx scripts/scan-nickname-violations.ts                 # dry-run 报告
 *   npx tsx scripts/scan-nickname-violations.ts --apply         # 清理违规昵称
 *   npx tsx scripts/scan-nickname-violations.ts --limit=1000    # 只扫描前 N 条
 *
 * --apply 时将违规昵称回退为 `用户_${手机号后四位}`，并写审计日志
 * （action=user_nickname_update, source=scan），不删除用户、不阻断登录。
 */
import "./load-env";

function readNumberArg(name: string, fallback: number): number {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const value = Number(raw.slice(name.length + 3));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

interface ViolationSample {
  userId: string;
  reason: string;
  category: string | null;
}

async function main(): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  const policy = await import("@/lib/nickname-policy");
  const audit = await import("@/lib/nickname-audit");

  const apply = process.argv.includes("--apply");
  const limit = readNumberArg("limit", 0);
  const batchSize = 500;

  let cursor: string | undefined;
  let scanned = 0;
  let violations = 0;
  let fixed = 0;
  let failed = 0;
  const samples: ViolationSample[] = [];

  try {
    for (;;) {
      const users = await prisma.user.findMany({
        where: {
          nickname: { not: null },
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        select: { id: true, phone: true, nickname: true },
        orderBy: { id: "asc" },
        take: batchSize,
      });

      if (users.length === 0) break;
      cursor = users[users.length - 1].id;

      for (const user of users) {
        scanned += 1;
        if (!user.nickname) continue;

        const check = policy.checkNicknameContent(user.nickname);
        if (check.ok) continue;

        violations += 1;
        if (samples.length < 20) {
          samples.push({
            userId: user.id,
            reason: check.reason,
            category: check.category ?? null,
          });
        }

        if (!apply) continue;

        const fallback = policy.defaultNicknameForPhone(user.phone);
        try {
          const updated = await prisma.user.updateMany({
            where: { id: user.id, nickname: user.nickname },
            data: { nickname: fallback },
          });
          if (updated.count === 0) continue;

          fixed += 1;
          await audit.auditNicknameChange({
            userId: user.id,
            oldNickname: user.nickname,
            newNickname: fallback,
            source: "scan",
          });
        } catch (error) {
          failed += 1;
          console.error(
            `[scan-nickname-violations] 修复失败 userId=${user.id}:`,
            error instanceof Error ? error.message : error
          );
        }
      }

      if (limit > 0 && scanned >= limit) break;
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        bannedWordCount: policy.getNicknameBannedWordCount(),
        scanned,
        violations,
        fixed,
        failed,
        samples,
      },
      null,
      2
    )
  );

  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("存量昵称扫描失败：", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
