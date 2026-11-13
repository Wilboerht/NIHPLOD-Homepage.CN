-- 简历异步删除队列
-- 大表性能索引不在此迁移创建：由 prisma/index-manifest.ts + scripts/apply-concurrent-indexes.ts
-- 在生产环境逐条 CREATE INDEX CONCURRENTLY 应用，避免长写锁。

CREATE TABLE IF NOT EXISTS "ResumeDeletionTask" (
  "id" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResumeDeletionTask_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ResumeDeletionTask_objectKey_key"
  ON "ResumeDeletionTask"("objectKey");
CREATE INDEX IF NOT EXISTS "ResumeDeletionTask_nextAttemptAt_idx"
  ON "ResumeDeletionTask"("nextAttemptAt");
