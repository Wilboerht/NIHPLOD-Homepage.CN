import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";

const DEFAULT_LOCK_TTL_MS = 15 * 60 * 1000;

/**
 * 抢占任务锁。返回 owner token；未抢到返回 null。
 *
 * 用单条 INSERT ... ON CONFLICT DO UPDATE ... WHERE 实现原子抢占，
 * 多实例/多进程同时触发同一任务时只有一个能成功。
 */
export async function acquireCronLock(
  taskName: string,
  ttlMs: number = DEFAULT_LOCK_TTL_MS
): Promise<string | null> {
  const owner = randomUUID();
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + ttlMs);

  try {
    const rows = await prisma.$queryRaw<{ taskName: string }[]>`
      INSERT INTO "CronTaskLock" ("taskName", "lockedUntil", "lockedBy", "updatedAt")
      VALUES (${taskName}, ${lockedUntil}, ${owner}, ${now})
      ON CONFLICT ("taskName") DO UPDATE
      SET "lockedUntil" = ${lockedUntil},
          "lockedBy" = ${owner},
          "updatedAt" = ${now}
      WHERE "CronTaskLock"."lockedUntil" < ${now}
      RETURNING "taskName"
    `;
    return rows.length > 0 ? owner : null;
  } catch (error) {
    // 锁表异常不应阻断任务本身：记录后按无锁执行，保留可用性。
    apiConsole.error("[CronLock] 获取锁失败:", error);
    return owner;
  }
}

export async function releaseCronLock(taskName: string, owner: string): Promise<void> {
  try {
    await prisma.$executeRaw`
      UPDATE "CronTaskLock"
      SET "lockedUntil" = ${new Date(0)}, "updatedAt" = ${new Date()}
      WHERE "taskName" = ${taskName} AND "lockedBy" = ${owner}
    `;
  } catch (error) {
    apiConsole.warn("[CronLock] 释放锁失败:", error);
  }
}
