ALTER TABLE "Image" ADD COLUMN "derivedUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "MediaDeletionTask" (
  "id" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextRetryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MediaDeletionTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MediaDeletionTask_nextRetryAt_idx" ON "MediaDeletionTask"("nextRetryAt");
