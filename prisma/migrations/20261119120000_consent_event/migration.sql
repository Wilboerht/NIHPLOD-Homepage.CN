-- 只追加的同意事件台账（不建 User 外键，注销后保留最小化证据）
CREATE TYPE "ConsentEventAction" AS ENUM ('GRANTED', 'REVOKED');
CREATE TYPE "ConsentEventProject" AS ENUM ('MAIN', 'POINTS', 'SKIN', 'KF', 'BA', 'RECRUIT', 'UNKNOWN');

CREATE TABLE "ConsentEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "subjectType" TEXT NOT NULL DEFAULT 'USER',
    "subjectHash" TEXT NOT NULL,
    "project" "ConsentEventProject" NOT NULL DEFAULT 'UNKNOWN',
    "document" "PrivacyConsentDocument" NOT NULL,
    "version" TEXT NOT NULL,
    "contentHash" TEXT,
    "action" "ConsentEventAction" NOT NULL,
    "channel" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "evidence" JSONB,
    "retentionUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConsentEvent_userId_occurredAt_idx"
    ON "ConsentEvent"("userId", "occurredAt" DESC);

CREATE INDEX "ConsentEvent_subjectHash_occurredAt_idx"
    ON "ConsentEvent"("subjectHash", "occurredAt" DESC);

CREATE INDEX "ConsentEvent_project_document_occurredAt_idx"
    ON "ConsentEvent"("project", "document", "occurredAt" DESC);

CREATE INDEX "ConsentEvent_retentionUntil_idx"
    ON "ConsentEvent"("retentionUntil");

CREATE INDEX "ConsentEvent_occurredAt_idx"
    ON "ConsentEvent"("occurredAt" DESC);
