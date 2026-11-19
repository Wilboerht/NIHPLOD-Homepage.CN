-- 隐私政策 / 服务条款 / 营销同意记录
CREATE TYPE "PrivacyConsentDocument" AS ENUM ('PRIVACY', 'TERMS', 'MARKETING');

CREATE TABLE "PrivacyConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "document" "PrivacyConsentDocument" NOT NULL,
    "version" TEXT NOT NULL,
    "contentHash" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'web',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "ipHash" TEXT,
    "userAgent" TEXT,
    "evidence" JSONB,

    CONSTRAINT "PrivacyConsent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PrivacyConsent_userId_document_version_channel_key"
    ON "PrivacyConsent"("userId", "document", "version", "channel");

CREATE INDEX "PrivacyConsent_userId_document_idx"
    ON "PrivacyConsent"("userId", "document");

CREATE INDEX "PrivacyConsent_document_version_idx"
    ON "PrivacyConsent"("document", "version");

CREATE INDEX "PrivacyConsent_grantedAt_idx"
    ON "PrivacyConsent"("grantedAt" DESC);

ALTER TABLE "PrivacyConsent"
    ADD CONSTRAINT "PrivacyConsent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
