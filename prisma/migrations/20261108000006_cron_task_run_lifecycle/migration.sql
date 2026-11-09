-- 定时任务运行生命周期：RUNNING/TIMEOUT/SKIPPED、心跳、重跑来源与稳定 taskKey
-- status 先保持可空，历史数据按 success 回填；新代码始终写入 status。

ALTER TABLE "CronTaskRun"
  ADD COLUMN "taskKey" TEXT,
  ADD COLUMN "status" TEXT,
  ADD COLUMN "heartbeatAt" TIMESTAMP(3),
  ADD COLUMN "lockOwner" TEXT,
  ADD COLUMN "timeoutMs" INTEGER,
  ADD COLUMN "sourceRunId" TEXT,
  ADD COLUMN "batchId" TEXT,
  ADD COLUMN "adminEmail" TEXT,
  ADD COLUMN "adminName" TEXT;

ALTER TABLE "CronTaskRun" ALTER COLUMN "success" DROP NOT NULL;
ALTER TABLE "CronTaskRun" ALTER COLUMN "finishedAt" DROP DEFAULT;
ALTER TABLE "CronTaskRun" ALTER COLUMN "finishedAt" DROP NOT NULL;

UPDATE "CronTaskRun"
SET "status" = CASE WHEN "success" THEN 'SUCCESS' ELSE 'FAILED' END
WHERE "status" IS NULL;

CREATE INDEX "CronTaskRun_taskKey_startedAt_idx"
  ON "CronTaskRun"("taskKey", "startedAt" DESC);
CREATE INDEX "CronTaskRun_status_heartbeatAt_idx"
  ON "CronTaskRun"("status", "heartbeatAt");
CREATE INDEX "CronTaskRun_status_startedAt_idx"
  ON "CronTaskRun"("status", "startedAt" DESC);
CREATE INDEX "CronTaskRun_batchId_idx"
  ON "CronTaskRun"("batchId");
