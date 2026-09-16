-- 定时任务运行记录（管理端监控/手动触发留痕）
CREATE TABLE "CronTaskRun" (
    "id" TEXT NOT NULL,
    "taskName" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'cron',
    "success" BOOLEAN NOT NULL,
    "error" TEXT,
    "adminId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CronTaskRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CronTaskRun_taskName_startedAt_idx" ON "CronTaskRun"("taskName", "startedAt" DESC);
CREATE INDEX "CronTaskRun_startedAt_idx" ON "CronTaskRun"("startedAt");
