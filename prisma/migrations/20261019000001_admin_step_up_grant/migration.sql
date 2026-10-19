-- 管理员敏感操作短时二次验证凭证（step-up / sudo mode）
CREATE TABLE "AdminStepUpGrant" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "sessionJti" TEXT,
  "tokenVersion" INTEGER NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'sensitive',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminStepUpGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminStepUpGrant_tokenHash_key" ON "AdminStepUpGrant"("tokenHash");
CREATE INDEX "AdminStepUpGrant_adminId_expiresAt_idx" ON "AdminStepUpGrant"("adminId", "expiresAt");
CREATE INDEX "AdminStepUpGrant_sessionJti_idx" ON "AdminStepUpGrant"("sessionJti");
CREATE INDEX "AdminStepUpGrant_expiresAt_idx" ON "AdminStepUpGrant"("expiresAt");

ALTER TABLE "AdminStepUpGrant"
  ADD CONSTRAINT "AdminStepUpGrant_adminId_fkey"
  FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
