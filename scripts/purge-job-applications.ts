/**
 * 按保留期清理职位申请（候选人 PII）。
 *
 * 用法：
 *   npx tsx scripts/purge-job-applications.ts --older-than-days=365          # dry-run
 *   npx tsx scripts/purge-job-applications.ts --older-than-days=365 --apply   # 实际删除
 *
 * 说明：
 * - 删除 JobApplication 记录及其私有简历文件；
 * - 默认 dry-run，必须显式 --apply 才会删除；
 * - 删除不可恢复，请先确认公司招聘数据保留政策并做好审计/备份；
 * - 建议由外部 cron 按固定周期执行，或手动在低峰期执行。
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { deleteResumeFile, isPrivateResumeKey } from "@/lib/resume-files";
import { deleteUploadedFile } from "@/lib/upload";

const APPLY = process.argv.includes("--apply");

function readOlderThanDays(): number | null {
  const arg = process.argv.find((value) => value.startsWith("--older-than-days="));
  const raw = arg ? arg.slice("--older-than-days=".length) : process.env.APPLICATION_RETENTION_DAYS;
  if (!raw) return null;
  const days = Number(raw);
  return Number.isInteger(days) && days > 0 ? days : null;
}

async function main() {
  const days = readOlderThanDays();
  if (!days) {
    console.error(
      "用法: npx tsx scripts/purge-job-applications.ts --older-than-days=<正整数> [--apply]"
    );
    process.exitCode = 1;
    return;
  }

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const applications = await prisma.jobApplication.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true, resumePath: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(
    `[applications-purge] ${APPLY ? "执行" : "dry-run"}：早于 ${cutoff.toISOString()} 的申请 ${applications.length} 条`
  );

  let deleted = 0;
  let failed = 0;

  for (const application of applications) {
    if (!APPLY) {
      console.log(`[dry-run] 将删除: ${application.id} (${application.createdAt.toISOString()})`);
      continue;
    }

    try {
      await prisma.jobApplication.delete({ where: { id: application.id } });
    } catch (error) {
      failed += 1;
      console.error(`[applications-purge] 删除记录失败: ${application.id}`, error);
      continue;
    }

    if (application.resumePath) {
      try {
        if (isPrivateResumeKey(application.resumePath)) {
          await deleteResumeFile(application.resumePath);
        } else {
          const removed = await deleteUploadedFile(application.resumePath);
          if (!removed) {
            console.warn(`[applications-purge] 旧公开简历删除失败，需人工清理: ${application.id}`);
          }
        }
      } catch (error) {
        console.error(`[applications-purge] 简历文件删除失败，需人工清理: ${application.id}`, error);
      }
    }

    deleted += 1;
  }

  console.log(
    `[applications-purge] ${APPLY ? "完成" : "dry-run"}：删除 ${deleted}，失败 ${failed}`
  );
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("[applications-purge] 任务异常:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
