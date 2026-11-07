-- 审计清理任务执行租约/心跳：worker 崩溃后可回收 RUNNING
ALTER TABLE "AuditRetentionJob"
  ADD COLUMN "leaseToken" TEXT,
  ADD COLUMN "heartbeatAt" TIMESTAMP(3);

CREATE INDEX "AuditRetentionJob_status_heartbeatAt_idx"
  ON "AuditRetentionJob"("status", "heartbeatAt");
