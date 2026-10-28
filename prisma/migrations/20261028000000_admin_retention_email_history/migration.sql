-- 管理员离职账号保留与邮箱复用
ALTER TABLE "Admin" ADD COLUMN "deletedBy" TEXT;
ALTER TABLE "Admin" ADD COLUMN "deletionReason" TEXT;
ALTER TABLE "Admin" ADD COLUMN "anonymizedAt" TIMESTAMP(3);

CREATE INDEX "Admin_anonymizedAt_idx" ON "Admin"("anonymizedAt");

CREATE TABLE "AdminEmailHistory" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedBy" TEXT,
    "reason" TEXT,

    CONSTRAINT "AdminEmailHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminEmailHistory_adminId_changedAt_idx" ON "AdminEmailHistory"("adminId", "changedAt" DESC);
CREATE INDEX "AdminEmailHistory_email_idx" ON "AdminEmailHistory"("email");

ALTER TABLE "AdminEmailHistory"
    ADD CONSTRAINT "AdminEmailHistory_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 历史数据回填：已软删除但仍保留真实邮箱的管理员，先归档再替换为 tombstone，
-- 释放邮箱给后续管理员复用；匿名化仍按 deletedAt + 保留期执行。
INSERT INTO "AdminEmailHistory" ("id", "adminId", "email", "changedAt", "changedBy", "reason")
SELECT
    'admin_email_' || "id",
    "id",
    "email",
    COALESCE("deletedAt", CURRENT_TIMESTAMP),
    NULL,
    'soft_delete_backfill'
FROM "Admin"
WHERE "deletedAt" IS NOT NULL
  AND "email" NOT LIKE '%@deleted.invalid';

UPDATE "Admin"
SET "email" = 'deleted+' || "id" || '@deleted.invalid'
WHERE "deletedAt" IS NOT NULL
  AND "email" NOT LIKE '%@deleted.invalid';
