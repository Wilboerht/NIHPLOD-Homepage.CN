-- 多实例定时任务互斥锁
CREATE TABLE "CronTaskLock" (
  "taskName" TEXT NOT NULL,
  "lockedUntil" TIMESTAMP(3) NOT NULL,
  "lockedBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CronTaskLock_pkey" PRIMARY KEY ("taskName")
);

CREATE INDEX "CronTaskLock_lockedUntil_idx" ON "CronTaskLock"("lockedUntil");
