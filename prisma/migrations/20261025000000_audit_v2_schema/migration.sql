-- 瀹¤ v2锛氬垎绫?椋庨櫓/鏉ユ簮/鍘熷洜銆佸搱甯岄摼銆佸綊妗ｉ敋鐐广€佸鍑轰换鍔°€佹硶寰嬩繚鐣欍€佸埌鏈熸竻鐞嗕换鍔?
ALTER TABLE "AuditLog"
  ADD COLUMN IF NOT EXISTS "category" TEXT,
  ADD COLUMN IF NOT EXISTS "riskLevel" TEXT,
  ADD COLUMN IF NOT EXISTS "source" TEXT,
  ADD COLUMN IF NOT EXISTS "reason" TEXT,
  ADD COLUMN IF NOT EXISTS "schemaVersion" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS "chainVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "integrityKeyVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "chainSeq" INTEGER,
  ADD COLUMN IF NOT EXISTS "prevHash" TEXT,
  ADD COLUMN IF NOT EXISTS "entryHash" TEXT,
  ADD COLUMN IF NOT EXISTS "finalizedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "AuditLog_chainSeq_key" ON "AuditLog"("chainSeq");
CREATE INDEX IF NOT EXISTS "AuditLog_actorType_createdAt_idx" ON "AuditLog"("actorType", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AuditLog_targetId_createdAt_idx" ON "AuditLog"("targetId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AuditLog_sessionJti_idx" ON "AuditLog"("sessionJti");
CREATE INDEX IF NOT EXISTS "AuditLog_riskLevel_createdAt_idx" ON "AuditLog"("riskLevel", "createdAt" DESC);

ALTER TABLE "AuditLogAnchor"
  ADD COLUMN IF NOT EXISTS "stream" TEXT NOT NULL DEFAULT 'audit',
  ADD COLUMN IF NOT EXISTS "signatureVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "keyVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "prevAnchorHash" TEXT,
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archiveSha256" TEXT,
  ADD COLUMN IF NOT EXISTS "verifyStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3);

DROP INDEX IF EXISTS "AuditLogAnchor_day_key";
CREATE UNIQUE INDEX IF NOT EXISTS "AuditLogAnchor_stream_day_signatureVersion_key"
  ON "AuditLogAnchor"("stream", "day", "signatureVersion");
CREATE INDEX IF NOT EXISTS "AuditLogAnchor_stream_day_idx"
  ON "AuditLogAnchor"("stream", "day" DESC);

ALTER TABLE "SsoAuditEvent"
  ADD COLUMN IF NOT EXISTS "requestId" TEXT;
CREATE INDEX IF NOT EXISTS "SsoAuditEvent_requestId_idx" ON "SsoAuditEvent"("requestId");

CREATE TABLE IF NOT EXISTS "AuditExportJob" (
  "id" TEXT NOT NULL,
  "adminId" TEXT,
  "adminEmail" TEXT,
  "adminName" TEXT,
  "stream" TEXT NOT NULL DEFAULT 'audit',
  "filters" JSONB NOT NULL,
  "format" TEXT NOT NULL DEFAULT 'csv',
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "processedRows" INTEGER NOT NULL DEFAULT 0,
  "filePath" TEXT,
  "sha256" TEXT,
  "error" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "AuditExportJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AuditExportJob_status_createdAt_idx" ON "AuditExportJob"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditExportJob_adminId_createdAt_idx" ON "AuditExportJob"("adminId", "createdAt");

CREATE TABLE IF NOT EXISTS "AuditLegalHold" (
  "id" TEXT NOT NULL,
  "targetType" TEXT,
  "targetId" TEXT,
  "userId" TEXT,
  "adminId" TEXT,
  "reason" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdByEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedBy" TEXT,
  "releasedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "AuditLegalHold_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AuditLegalHold_active_targetType_targetId_idx"
  ON "AuditLegalHold"("active", "targetType", "targetId");
CREATE INDEX IF NOT EXISTS "AuditLegalHold_active_userId_idx" ON "AuditLegalHold"("active", "userId");
CREATE INDEX IF NOT EXISTS "AuditLegalHold_active_adminId_idx" ON "AuditLegalHold"("active", "adminId");

CREATE TABLE IF NOT EXISTS "AuditRetentionJob" (
  "id" TEXT NOT NULL,
  "requestedBy" TEXT NOT NULL,
  "requestedByEmail" TEXT,
  "requestedByRole" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "streams" JSONB NOT NULL,
  "cutoff" TIMESTAMP(3) NOT NULL,
  "previewHash" TEXT NOT NULL,
  "expectedCount" INTEGER NOT NULL,
  "expectedBytes" INTEGER NOT NULL,
  "localOnlyAck" BOOLEAN NOT NULL DEFAULT false,
  "totpVerifiedAt" TIMESTAMP(3) NOT NULL,
  "approvalSignature" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "deletedCount" INTEGER NOT NULL DEFAULT 0,
  "deletedBytes" INTEGER NOT NULL DEFAULT 0,
  "holdsExcluded" INTEGER NOT NULL DEFAULT 0,
  "archiveManifests" JSONB,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuditRetentionJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AuditRetentionJob_status_createdAt_idx"
  ON "AuditRetentionJob"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditRetentionJob_requestedBy_createdAt_idx"
  ON "AuditRetentionJob"("requestedBy", "createdAt");

CREATE TABLE IF NOT EXISTS "AuditAlertState" (
  "ruleKey" TEXT NOT NULL,
  "lastSentAt" TIMESTAMP(3) NOT NULL,
  "lastCount" INTEGER NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuditAlertState_pkey" PRIMARY KEY ("ruleKey")
);

