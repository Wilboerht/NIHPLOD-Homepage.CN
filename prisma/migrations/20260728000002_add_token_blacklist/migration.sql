-- CreateEnum
CREATE TYPE "TokenBlacklistType" AS ENUM ('access_token', 'user');

-- CreateTable
CREATE TABLE "TokenBlacklist" (
    "id" TEXT NOT NULL,
    "type" "TokenBlacklistType" NOT NULL,
    "key" TEXT NOT NULL,
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenBlacklist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TokenBlacklist_key_key" ON "TokenBlacklist"("key");

-- CreateIndex
CREATE INDEX "TokenBlacklist_type_idx" ON "TokenBlacklist"("type");

-- CreateIndex
CREATE INDEX "TokenBlacklist_expiresAt_idx" ON "TokenBlacklist"("expiresAt");
