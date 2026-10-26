ALTER TABLE "AuditExportJob" ADD COLUMN "heartbeatAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "AuditExportJob_status_heartbeatAt_idx"
  ON "AuditExportJob" ("status", "heartbeatAt");

CREATE INDEX IF NOT EXISTS "LoginAttempt_createdAt_idx" ON "LoginAttempt" ("createdAt");
CREATE INDEX IF NOT EXISTS "SmsCode_createdAt_idx" ON "SmsCode" ("createdAt");
CREATE INDEX IF NOT EXISTS "RefreshToken_revokedAt_idx" ON "RefreshToken" ("revokedAt");
CREATE INDEX IF NOT EXISTS "UserConsent_revokedAt_idx" ON "UserConsent" ("revokedAt");
