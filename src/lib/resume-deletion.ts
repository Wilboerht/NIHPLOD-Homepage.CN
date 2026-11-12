/**
 * 简历文件删除 outbox。
 *
 * 删除申请时先把待删文件写入 ResumeDeletionTask（与申请删除同事务），
 * 再由 cron 重试物理删除；避免“数据库记录已删、含 PII 的文件仍残留”。
 */
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";
import { deleteResumeFile, isPrivateResumeKey } from "@/lib/resume-files";
import { deleteUploadedFile } from "@/lib/upload";

export const RESUME_DELETION_MAX_ATTEMPTS = 8;

export async function enqueueResumeDeletion(
  tx: Prisma.TransactionClient,
  objectKey: string | null | undefined
): Promise<void> {
  const key = objectKey?.trim();
  if (!key) return;
  await tx.resumeDeletionTask.upsert({
    where: { objectKey: key },
    create: { objectKey: key },
    update: {},
  });
}

/** 立即尝试删除并移除 outbox 任务；失败时任务保留给 cron 重试。 */
export async function deleteResumeNow(objectKey: string): Promise<void> {
  await deleteResumeArtifact(objectKey);
  await prisma.resumeDeletionTask.deleteMany({ where: { objectKey } });
}

async function deleteResumeArtifact(objectKey: string): Promise<void> {
  if (isPrivateResumeKey(objectKey)) {
    await deleteResumeFile(objectKey);
    return;
  }
  const deleted = await deleteUploadedFile(objectKey);
  if (!deleted) throw new Error("PUBLIC_RESUME_DELETE_FAILED");
}

/**
 * 处理到期的简历删除任务。返回成功删除的任务数。
 * 失败按指数退避重试，超过上限后停止自动重试并保留记录供人工处理。
 */
export async function processResumeDeletionTasks(limit = 50): Promise<number> {
  const now = new Date();
  const tasks = await prisma.resumeDeletionTask.findMany({
    where: { nextAttemptAt: { lte: now } },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
    select: { id: true, objectKey: true, attempts: true },
  });

  let deleted = 0;
  for (const task of tasks) {
    try {
      await deleteResumeArtifact(task.objectKey);
      await prisma.resumeDeletionTask.delete({ where: { id: task.id } });
      deleted += 1;
    } catch (error) {
      const attempts = task.attempts + 1;
      const message = error instanceof Error ? error.message : String(error);
      if (attempts >= RESUME_DELETION_MAX_ATTEMPTS) {
        // 保留记录并把下次重试推到远期，避免死循环；由运维告警发现后手工处理。
        await prisma.resumeDeletionTask.update({
          where: { id: task.id },
          data: {
            attempts,
            lastError: message.slice(0, 2000),
            nextAttemptAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          },
        });
        apiConsole.error(
          `[ResumeDeletion] 任务 ${task.id} 连续失败 ${attempts} 次，停止自动重试:`,
          message
        );
      } else {
        const delayMs = Math.min(60 * 60 * 1000, 60_000 * 2 ** attempts);
        await prisma.resumeDeletionTask.update({
          where: { id: task.id },
          data: {
            attempts,
            lastError: message.slice(0, 2000),
            nextAttemptAt: new Date(Date.now() + delayMs),
          },
        });
      }
    }
  }
  return deleted;
}
