import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { deleteUploadedFile } from "@/lib/upload";
import { notifyWithCooldown } from "@/lib/alert-notify";

export function mediaDeletionData(objectKey: string) {
  return { objectKey, nextRetryAt: new Date() };
}

export async function processMediaDeletionTasks(limit = 50): Promise<number> {
  const tasks = await prisma.mediaDeletionTask.findMany({
    where: { nextRetryAt: { lte: new Date() }, attempts: { lt: 8 } },
    orderBy: { nextRetryAt: "asc" },
    take: limit,
  });
  let completed = 0;
  for (const task of tasks) {
    const claimed = await prisma.mediaDeletionTask.updateMany({
      where: { id: task.id, nextRetryAt: task.nextRetryAt },
      data: { nextRetryAt: new Date(Date.now() + 60_000) },
    });
    if (claimed.count === 0) continue;
    try {
      // 防止误删仍被产品引用的对象：删除队列创建后，其他管理员可能重新
      // 保存了同一 URL（例如陈旧表单/回收站恢复）。仍被引用时放弃删除任务。
      const referenced = await prisma.image.findFirst({
        where: {
          OR: [{ url: task.objectKey }, { derivedUrls: { has: task.objectKey } }],
        },
        select: { id: true },
      });
      if (referenced) {
        await prisma.mediaDeletionTask.delete({ where: { id: task.id } });
        continue;
      }
      await deleteUploadedFile(task.objectKey);
      await prisma.mediaDeletionTask.delete({ where: { id: task.id } });
      completed += 1;
    } catch (error) {
      const attempts = task.attempts + 1;
      await prisma.mediaDeletionTask.update({
        where: { id: task.id },
        data: {
          attempts,
          lastError: error instanceof Error ? error.message.slice(0, 1000) : "UNKNOWN",
          nextRetryAt: new Date(Date.now() + Math.min(60_000 * 2 ** attempts, 3600_000)),
        },
      });
      if (attempts >= 8) {
        // 达到重试上限后任务会被 attempts<8 永久排除，必须告警避免静默遗留。
        notifyWithCooldown({
          ruleKey: `media-deletion-dead:${task.objectKey}`,
          count: 1,
          cooldownMs: 24 * 60 * 60 * 1000,
          type: "admin",
          title: "媒体删除任务重试耗尽",
          lines: [
            `- 对象：${task.objectKey}`,
            `- 重试：${attempts} 次`,
            `- 错误：${error instanceof Error ? error.message.slice(0, 500) : "UNKNOWN"}`,
          ],
        });
      }
    }
  }
  return completed;
}

export async function enqueueMediaDeletions(
  tx: Prisma.TransactionClient,
  objectKeys: string[]
): Promise<void> {
  const unique = [...new Set(objectKeys.filter(Boolean))];
  if (unique.length === 0) return;
  await tx.mediaDeletionTask.createMany({
    data: unique.map(mediaDeletionData),
  });
}
