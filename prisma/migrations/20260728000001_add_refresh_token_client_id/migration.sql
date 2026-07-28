-- Add clientId to RefreshToken for OAuth refresh token ownership tracking

-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN "clientId" TEXT;

-- CreateIndex
CREATE INDEX "RefreshToken_userId_clientId_revokedAt_expiresAt_idx" ON "RefreshToken"("userId", "clientId", "revokedAt", "expiresAt");
