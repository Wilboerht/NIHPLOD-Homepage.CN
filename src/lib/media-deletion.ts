import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { deleteUploadedFile } from "@/lib/upload";

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
