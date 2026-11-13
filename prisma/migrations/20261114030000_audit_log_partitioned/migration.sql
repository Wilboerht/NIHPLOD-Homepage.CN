-- AuditLog 按月分区。该迁移需要维护窗口：转换期间暂停审计写入。
-- 旧表保留为 AuditLog_legacy，验证 7 天后由运维手工删除。
SET LOCAL TIME ZONE 'UTC';

ALTER TABLE "AuditLog" RENAME TO "AuditLog_legacy";

CREATE TABLE "AuditLog_partitioned" (
  LIKE "AuditLog_legacy" INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING IDENTITY INCLUDING STORAGE INCLUDING COMMENTS
) PARTITION BY RANGE ("createdAt");

DO $$
DECLARE
  first_month date;
  last_month date;
  cursor_month date;
  part_name text;
BEGIN
  SELECT
    date_trunc('month', COALESCE(MIN("createdAt"), now()))::date,
    date_trunc('month', COALESCE(MAX("createdAt"), now()))::date
  INTO first_month, last_month
  FROM "AuditLog_legacy";

  cursor_month := first_month;
  WHILE cursor_month <= (last_month + interval '3 months')::date LOOP
    part_name := 'AuditLog_' || to_char(cursor_month, 'YYYY_MM');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF "AuditLog_partitioned" FOR VALUES FROM (%L) TO (%L)',
      part_name,
      cursor_month::timestamp,
      (cursor_month + interval '1 month')::timestamp
    );
    cursor_month := (cursor_month + interval '1 month')::date;
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS "AuditLog_default" PARTITION OF "AuditLog_partitioned" DEFAULT;

INSERT INTO "AuditLog_partitioned" SELECT * FROM "AuditLog_legacy";

ALTER TABLE "AuditLog_legacy" DROP CONSTRAINT IF EXISTS "AuditLog_pkey";
ALTER TABLE "AuditLog_legacy" DROP CONSTRAINT IF EXISTS "AuditLog_adminId_fkey";
ALTER TABLE "AuditLog_legacy" DROP CONSTRAINT IF EXISTS "AuditLog_userId_fkey";

DROP INDEX IF EXISTS "AuditLog_chainSeq_key";
DROP INDEX IF EXISTS "AuditLog_chainSeq_createdAt_key";
DROP INDEX IF EXISTS "AuditLog_chainSeq_idx";
DROP INDEX IF EXISTS "AuditLog_action_createdAt_idx";
DROP INDEX IF EXISTS "AuditLog_targetType_targetId_idx";
DROP INDEX IF EXISTS "AuditLog_targetType_createdAt_idx";
DROP INDEX IF EXISTS "AuditLog_adminId_createdAt_idx";
DROP INDEX IF EXISTS "AuditLog_userId_createdAt_idx";
DROP INDEX IF EXISTS "AuditLog_outcome_createdAt_idx";
DROP INDEX IF EXISTS "AuditLog_requestId_idx";
DROP INDEX IF EXISTS "AuditLog_createdAt_idx";
DROP INDEX IF EXISTS "AuditLog_actorType_createdAt_idx";
DROP INDEX IF EXISTS "AuditLog_targetId_createdAt_idx";
DROP INDEX IF EXISTS "AuditLog_sessionJti_idx";
DROP INDEX IF EXISTS "AuditLog_riskLevel_createdAt_idx";
DROP INDEX IF EXISTS "AuditLog_createdAt_id_idx";
DROP INDEX IF EXISTS "AuditLog_category_createdAt_idx";
DROP INDEX IF EXISTS "AuditLog_source_createdAt_idx";
DROP INDEX IF EXISTS "AuditLog_authMethod_createdAt_idx";
DROP INDEX IF EXISTS "AuditLog_ipAddress_createdAt_idx";
DROP INDEX IF EXISTS "AuditLog_action_adminId_createdAt_idx";

ALTER TABLE "AuditLog_partitioned" ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id", "createdAt");
CREATE UNIQUE INDEX "AuditLog_chainSeq_createdAt_key" ON "AuditLog_partitioned"("chainSeq", "createdAt");
CREATE INDEX "AuditLog_chainSeq_idx" ON "AuditLog_partitioned"("chainSeq");
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog_partitioned"("action", "createdAt" DESC);
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog_partitioned"("targetType", "targetId");
CREATE INDEX "AuditLog_targetType_createdAt_idx" ON "AuditLog_partitioned"("targetType", "createdAt" DESC);
CREATE INDEX "AuditLog_adminId_createdAt_idx" ON "AuditLog_partitioned"("adminId", "createdAt" DESC);
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog_partitioned"("userId", "createdAt" DESC);
CREATE INDEX "AuditLog_outcome_createdAt_idx" ON "AuditLog_partitioned"("outcome", "createdAt" DESC);
CREATE INDEX "AuditLog_requestId_idx" ON "AuditLog_partitioned"("requestId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog_partitioned"("createdAt");
CREATE INDEX "AuditLog_actorType_createdAt_idx" ON "AuditLog_partitioned"("actorType", "createdAt" DESC);
CREATE INDEX "AuditLog_targetId_createdAt_idx" ON "AuditLog_partitioned"("targetId", "createdAt" DESC);
CREATE INDEX "AuditLog_sessionJti_idx" ON "AuditLog_partitioned"("sessionJti");
CREATE INDEX "AuditLog_riskLevel_createdAt_idx" ON "AuditLog_partitioned"("riskLevel", "createdAt" DESC);
CREATE INDEX "AuditLog_createdAt_id_idx" ON "AuditLog_partitioned"("createdAt" DESC, "id" ASC);
CREATE INDEX "AuditLog_category_createdAt_idx" ON "AuditLog_partitioned"("category", "createdAt" DESC);
CREATE INDEX "AuditLog_source_createdAt_idx" ON "AuditLog_partitioned"("source", "createdAt" DESC);
CREATE INDEX "AuditLog_authMethod_createdAt_idx" ON "AuditLog_partitioned"("authMethod", "createdAt" DESC);
CREATE INDEX "AuditLog_ipAddress_createdAt_idx" ON "AuditLog_partitioned"("ipAddress", "createdAt" DESC);
CREATE INDEX "AuditLog_action_adminId_createdAt_idx" ON "AuditLog_partitioned"("action", "adminId", "createdAt" DESC);

-- trigram 索引在离线重表阶段创建；分区父表不支持 CREATE INDEX CONCURRENTLY。
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'pg_trgm 扩展不可用，跳过 AuditLog trigram 索引';
END $$;
DO $$
DECLARE
  stmt text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    FOREACH stmt IN ARRAY ARRAY[
      'CREATE INDEX IF NOT EXISTS "AuditLog_targetLabel_trgm" ON "AuditLog_partitioned" USING gin ("targetLabel" gin_trgm_ops)',
      'CREATE INDEX IF NOT EXISTS "AuditLog_targetId_trgm" ON "AuditLog_partitioned" USING gin ("targetId" gin_trgm_ops)',
      'CREATE INDEX IF NOT EXISTS "AuditLog_actorName_trgm" ON "AuditLog_partitioned" USING gin ("actorName" gin_trgm_ops)',
      'CREATE INDEX IF NOT EXISTS "AuditLog_actorEmail_trgm" ON "AuditLog_partitioned" USING gin ("actorEmail" gin_trgm_ops)',
      'CREATE INDEX IF NOT EXISTS "AuditLog_requestId_trgm" ON "AuditLog_partitioned" USING gin ("requestId" gin_trgm_ops)',
      'CREATE INDEX IF NOT EXISTS "AuditLog_action_trgm" ON "AuditLog_partitioned" USING gin ("action" gin_trgm_ops)'
    ] LOOP
      EXECUTE stmt;
    END LOOP;
  END IF;
END $$;

ALTER TABLE "AuditLog_partitioned"
  ADD CONSTRAINT "AuditLog_adminId_fkey"
  FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog_partitioned"
  ADD CONSTRAINT "AuditLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP TRIGGER IF EXISTS "AuditLog_guard_update" ON "AuditLog_partitioned";
CREATE TRIGGER "AuditLog_guard_update"
  BEFORE UPDATE ON "AuditLog_partitioned"
  FOR EACH ROW EXECUTE FUNCTION "audit_log_guard_update"();
DROP TRIGGER IF EXISTS "AuditLog_guard_delete" ON "AuditLog_partitioned";
CREATE TRIGGER "AuditLog_guard_delete"
  BEFORE DELETE ON "AuditLog_partitioned"
  FOR EACH ROW EXECUTE FUNCTION "audit_log_guard_delete"();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_retention') THEN
    EXECUTE 'GRANT SELECT, DELETE ON "AuditLog_partitioned" TO audit_retention';
  END IF;
END $$;

ALTER TABLE "AuditLog_partitioned" RENAME TO "AuditLog";
ANALYZE "AuditLog";

COMMENT ON TABLE "AuditLog_legacy" IS 'AuditLog 分区转换前备份；验证 7 天后可删除';
