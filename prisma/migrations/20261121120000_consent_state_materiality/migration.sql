-- Consent state/version architecture.
CREATE TYPE "LegalMateriality" AS ENUM ('MATERIAL', 'NON_MATERIAL', 'CORRECTION');
CREATE TYPE "ConsentStateStatus" AS ENUM ('GRANTED', 'REVOKED');

ALTER TABLE "LegalDocument"
    ADD COLUMN "requiredConsentVersionId" TEXT;

ALTER TABLE "LegalDocumentVersion"
    ADD COLUMN "materiality" "LegalMateriality" NOT NULL DEFAULT 'NON_MATERIAL',
    ADD COLUMN "effectiveAt" TIMESTAMP(3),
    ADD COLUMN "reviewedById" TEXT,
    ADD COLUMN "reviewedByEmail" TEXT,
    ADD COLUMN "reviewedByName" TEXT;

UPDATE "LegalDocumentVersion"
SET "materiality" = CASE
        WHEN "requiresReconsent" THEN 'MATERIAL'::"LegalMateriality"
        ELSE 'NON_MATERIAL'::"LegalMateriality"
    END,
    "effectiveAt" = COALESCE("effectiveAt", "createdAt");

ALTER TABLE "ConsentEvent"
    ADD COLUMN "legalDocumentVersionId" TEXT,
    ADD COLUMN "idempotencyKey" TEXT;

CREATE TABLE "UserConsentState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "document" "PrivacyConsentDocument" NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'web',
    "legalDocumentVersionId" TEXT,
    "status" "ConsentStateStatus" NOT NULL DEFAULT 'GRANTED',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "contentHash" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "evidence" JSONB,
    CONSTRAINT "UserConsentState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserConsentState_userId_document_channel_key"
    ON "UserConsentState"("userId", "document", "channel");
CREATE INDEX "UserConsentState_userId_document_status_idx"
    ON "UserConsentState"("userId", "document", "status");
CREATE INDEX "UserConsentState_document_legalDocumentVersionId_idx"
    ON "UserConsentState"("document", "legalDocumentVersionId");
CREATE INDEX "UserConsentState_grantedAt_idx"
    ON "UserConsentState"("grantedAt" DESC);

CREATE INDEX "LegalDocumentVersion_documentId_materiality_version_idx"
    ON "LegalDocumentVersion"("documentId", "materiality", "version");
CREATE INDEX "ConsentEvent_legalDocumentVersionId_idx"
    ON "ConsentEvent"("legalDocumentVersionId");
CREATE INDEX "ConsentEvent_idempotencyKey_idx"
    ON "ConsentEvent"("idempotencyKey");
CREATE UNIQUE INDEX "ConsentEvent_userId_idempotencyKey_key"
    ON "ConsentEvent"("userId", "idempotencyKey");

-- Mark the currently published material version on each document.
WITH latest_material AS (
    SELECT DISTINCT ON ("documentId")
        "documentId",
        "id"
    FROM "LegalDocumentVersion"
    WHERE "materiality" = 'MATERIAL'
    ORDER BY "documentId", "version" DESC
)
UPDATE "LegalDocument" AS d
SET "requiredConsentVersionId" = lm."id"
FROM latest_material AS lm
WHERE lm."documentId" = d."id";

-- Backfill current consent state from the latest legacy record per document/channel.
WITH latest AS (
    SELECT DISTINCT ON ("userId", "document", "channel") *
    FROM "PrivacyConsent"
    ORDER BY "userId", "document", "channel", "grantedAt" DESC, "id" DESC
)
INSERT INTO "UserConsentState" (
    "id",
    "userId",
    "document",
    "channel",
    "legalDocumentVersionId",
    "status",
    "grantedAt",
    "revokedAt",
    "contentHash",
    "ipHash",
    "userAgent",
    "evidence"
)
SELECT
    l."id",
    l."userId",
    l."document",
    l."channel",
    CASE
        WHEN l."document" = 'MARKETING' THEN NULL
        ELSE (
            SELECT v."id"
            FROM "LegalDocumentVersion" AS v
            INNER JOIN "LegalDocument" AS d ON d."id" = v."documentId"
            WHERE d."slug" = CASE
                    WHEN l."document" = 'PRIVACY' THEN 'privacy'
                    WHEN l."document" = 'TERMS' THEN 'terms'
                    ELSE NULL
                END
              AND v."version" = l."documentVersion"
            LIMIT 1
        )
    END,
    CASE
        WHEN l."revokedAt" IS NULL THEN 'GRANTED'::"ConsentStateStatus"
        ELSE 'REVOKED'::"ConsentStateStatus"
    END,
    l."grantedAt",
    l."revokedAt",
    l."contentHash",
    l."ipHash",
    l."userAgent",
    l."evidence"
FROM latest AS l
ON CONFLICT ("userId", "document", "channel") DO NOTHING;

-- Backfill the version FK on existing audit events where possible.
UPDATE "ConsentEvent" AS e
SET "legalDocumentVersionId" = v."id"
FROM "LegalDocumentVersion" AS v
INNER JOIN "LegalDocument" AS d ON d."id" = v."documentId"
WHERE d."slug" = CASE
        WHEN e."document" = 'PRIVACY' THEN 'privacy'
        WHEN e."document" = 'TERMS' THEN 'terms'
        ELSE NULL
    END
  AND v."version" = e."documentVersion";

ALTER TABLE "UserConsentState"
    ADD CONSTRAINT "UserConsentState_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "UserConsentState_legalDocumentVersionId_fkey"
    FOREIGN KEY ("legalDocumentVersionId") REFERENCES "LegalDocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LegalDocument"
    ADD CONSTRAINT "LegalDocument_requiredConsentVersionId_fkey"
    FOREIGN KEY ("requiredConsentVersionId") REFERENCES "LegalDocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ConsentEvent"
    ADD CONSTRAINT "ConsentEvent_legalDocumentVersionId_fkey"
    FOREIGN KEY ("legalDocumentVersionId") REFERENCES "LegalDocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
