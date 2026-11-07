-- 审批执行租约/心跳：避免长时间执行被超时回收后重复执行
ALTER TABLE "AdminApprovalRequest"
  ADD COLUMN "leaseToken" TEXT,
  ADD COLUMN "heartbeatAt" TIMESTAMP(3);

CREATE INDEX "AdminApprovalRequest_status_heartbeatAt_idx"
  ON "AdminApprovalRequest"("status", "heartbeatAt");
