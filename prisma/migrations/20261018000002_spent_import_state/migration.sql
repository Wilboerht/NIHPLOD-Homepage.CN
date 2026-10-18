-- Excel 导入批次状态机 + 实际生效 delta + 撤销标记
CREATE TYPE "SpentImportBatchStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

ALTER TABLE "SpentImportBatch" ADD COLUMN "status" "SpentImportBatchStatus" NOT NULL DEFAULT 'PROCESSING';
ALTER TABLE "SpentImportBatch" ADD COLUMN "processedRows" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SpentImportBatch" ADD COLUMN "lastError" TEXT;
ALTER TABLE "SpentImportBatch" ADD COLUMN "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "SpentImportBatch" ADD COLUMN "finishedAt" TIMESTAMP(3);

ALTER TABLE "SpentImportRow" ADD COLUMN "appliedDelta" INTEGER;
ALTER TABLE "SpentImportRow" ADD COLUMN "revertedAt" TIMESTAMP(3);

ALTER TABLE "SpentSyncRecord" ADD COLUMN "revertedAt" TIMESTAMP(3);

CREATE INDEX "SpentImportBatch_fileHash_undoneAt_idx"
  ON "SpentImportBatch"("fileHash", "undoneAt");
CREATE INDEX "SpentImportBatch_status_createdAt_idx"
  ON "SpentImportBatch"("status", "createdAt");
ALTER TYPE "SpentImportRowStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TABLE "SpentImportBatch" ADD COLUMN "version" TEXT;
