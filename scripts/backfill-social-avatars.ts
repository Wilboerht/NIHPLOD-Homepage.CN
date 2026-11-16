/**
 * 社交头像回填：把历史遗留的微信/抖音头像热链镜像到自有存储
 *
 * 登录/绑定时会自动镜像；本脚本用于处理存量数据（老会话用户、历史外链），
 * 避免这些用户在主站/子站一直看到默认头像。
 *
 * 用法：
 *   npx tsx scripts/backfill-social-avatars.ts              # dry-run：仅统计候选，不下载/写库
 *   npx tsx scripts/backfill-social-avatars.ts --apply      # 实际镜像并写库
 *   npx tsx scripts/backfill-social-avatars.ts --apply --limit=200
 *
 * 注意：
 * - 默认只处理前 100 条；请按批次执行，观察日志后再扩大范围
 * - 下载/转存失败的用户保持原值（前端回退默认头像），不影响其他用户
 */
import "./load-env";

function readLimitArg(): number {
  const raw = process.argv.find((arg) => arg.startsWith("--limit="));
  if (!raw) return 100;
  const value = Number(raw.slice("--limit=".length));
  return Number.isFinite(value) && value >= 1 ? Math.min(1000, Math.floor(value)) : 100;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const limit = readLimitArg();
  const { prisma } = await import("@/lib/prisma");
  const { isSocialAvatarUrl } = await import("@/lib/avatar-url");
  const { cleanupAvatarUpload, prepareAvatarReplacement } = await import("@/lib/avatar-assets");
  const { mirrorSocialAvatarForLogin } = await import("@/lib/social-avatar");

  try {
    const candidates: { id: string; avatar: string }[] = [];
    let scanned = 0;
    let cursor: string | undefined;
    while (candidates.length < limit) {
      const page = await prisma.user.findMany({
        where: { status: { not: "DELETED" }, avatar: { not: null } },
        select: { id: true, avatar: true },
        orderBy: { id: "asc" },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: 500,
      });
      scanned += page.length;
      for (const user of page) {
        if (isSocialAvatarUrl(user.avatar) && candidates.length < limit) {
          candidates.push({ id: user.id, avatar: user.avatar as string });
        }
      }
      if (page.length < 500) break;
      cursor = page[page.length - 1].id;
    }

    if (!apply) {
      console.log(
        JSON.stringify(
          {
            mode: "dry-run",
            scanned,
            candidates: candidates.length,
            sample: candidates.slice(0, 10),
          },
          null,
          2
        )
      );
      return;
    }

    let mirrored = 0;
    let failed = 0;
    for (const user of candidates) {
      const upload = await mirrorSocialAvatarForLogin(user.avatar, user.avatar, "social");
      if (!upload) {
        failed += 1;
        continue;
      }
      try {
        await prisma.$transaction(async (tx) => {
          await prepareAvatarReplacement(tx, {
            userId: user.id,
            nextAvatar: upload.url,
            newUpload: upload,
            allowInactive: true,
          });
          await tx.user.update({ where: { id: user.id }, data: { avatar: upload.url } });
        });
        mirrored += 1;
      } catch (error) {
        await cleanupAvatarUpload(upload);
        failed += 1;
        console.error(`[Backfill] 用户 ${user.id} 写入失败:`, error);
      }
    }

    console.log(
      JSON.stringify(
        { mode: "apply", scanned, candidates: candidates.length, mirrored, failed },
        null,
        2
      )
    );
    if (failed > 0) process.exitCode = 1;
  } finally {
    const { prisma } = await import("@/lib/prisma");
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[Backfill] 执行失败:", error);
  process.exitCode = 1;
});
