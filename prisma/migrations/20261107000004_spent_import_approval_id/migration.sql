-- 导入批次记录来源审批 ID，用于审批重试的精确幂等
ALTER TABLE "SpentImportBatch" ADD COLUMN "approvalId" TEXT;

CREATE INDEX "SpentImportBatch_approvalId_idx"
  ON "SpentImportBatch"("approvalId");
