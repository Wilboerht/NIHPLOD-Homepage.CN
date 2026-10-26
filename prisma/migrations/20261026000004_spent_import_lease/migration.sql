ALTER TABLE "SpentImportBatch"
  ADD COLUMN "leaseToken" TEXT,
  ADD COLUMN "heartbeatAt" TIMESTAMP(3);

CREATE INDEX "SpentImportBatch_status_heartbeatAt_idx"
  ON "SpentImportBatch" ("status", "heartbeatAt");
