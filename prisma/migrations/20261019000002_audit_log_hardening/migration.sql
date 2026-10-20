-- 审计日志硬化：outcome、请求关联、操作者/目标快照、不可变关联、每日摘要锚点
CREATE TYPE "AuditOutcome" AS ENUM ('PENDING', 'SUCCESS', 'FAILURE', 'PARTIAL');
CREATE TYPE "AuditActorType" AS ENUM ('ADMIN', 'USER', 'SYSTEM', 'INTEGRATION');

ALTER TABLE "AuditLog"
  ADD COLUMN "outcome" "AuditOutcome" NOT NULL DEFAULT 'SUCCESS',
  ADD COLUMN "requestId" TEXT,
  ADD COLUMN "actorType" "AuditActorType" NOT NULL DEFAULT 'ADMIN',
  ADD COLUMN "actorEmail" TEXT,
  ADD COLUMN "actorName" TEXT,
  ADD COLUMN "actorRole" TEXT,
  ADD COLUMN "targetLabel" TEXT,
  ADD COLUMN "authMethod" TEXT,
  ADD COLUMN "sessionJti" TEXT,
  ADD COLUMN "legalHold" BOOLEAN NOT NULL DEFAULT false;

-- 回填操作者快照（管理员）
UPDATE "AuditLog" AS a
SET "actorEmail" = ad."email",
    "actorName" = ad."name",
    "actorRole" = ad."role"::text
FROM "Admin" AS ad
WHERE a."adminId" = ad."id"
  AND a."actorEmail" IS NULL;

-- 回填操作者快照（C 端用户；User 无邮箱字段，保留昵称）
UPDATE "AuditLog" AS a
SET "actorType" = 'USER',
    "actorName" = COALESCE(u."nickname", a."actorName")
FROM "User" AS u
WHERE a."userId" = u."id"
  AND a."actorType" = 'ADMIN';

-- 删除时不再把审计行中的 adminId/userId 置空，保护历史记录
ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_adminId_fkey";
ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_userId_fkey";
ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_adminId_fkey"
  FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "AuditLog_outcome_createdAt_idx" ON "AuditLog"("outcome", "createdAt" DESC);
CREATE INDEX "AuditLog_requestId_idx" ON "AuditLog"("requestId");

CREATE TABLE "AuditLogAnchor" (
  "id" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "fromAt" TIMESTAMP(3) NOT NULL,
  "toAt" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL,
  "digest" TEXT NOT NULL,
  "signature" TEXT NOT NULL,
  "objectKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLogAnchor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuditLogAnchor_day_key" ON "AuditLogAnchor"("day");
CREATE INDEX "AuditLogAnchor_createdAt_idx" ON "AuditLogAnchor"("createdAt");
