-- 管理端性能索引 + 简历异步删除队列
--
-- 注意：本迁移使用普通 CREATE INDEX（可在事务内执行）。生产大表如希望避免
-- 写锁，可复制对应 CREATE INDEX 语句，改为 CREATE INDEX CONCURRENTLY 手工执行。

-- ============================================
-- 简历异步删除队列
-- ============================================

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

-- ============================================
-- pg_trgm 模糊搜索索引（可选；无权限时跳过）
-- ============================================

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'pg_trgm 扩展不可用，跳过 trigram 索引；请联系 DBA 安装后重新执行';
END $$;

DO $$
DECLARE
  stmt text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    FOREACH stmt IN ARRAY ARRAY[
      'CREATE INDEX IF NOT EXISTS "AuditLog_targetLabel_trgm" ON "AuditLog" USING gin ("targetLabel" gin_trgm_ops)',
      'CREATE INDEX IF NOT EXISTS "AuditLog_targetId_trgm" ON "AuditLog" USING gin ("targetId" gin_trgm_ops)',
      'CREATE INDEX IF NOT EXISTS "AuditLog_actorName_trgm" ON "AuditLog" USING gin ("actorName" gin_trgm_ops)',
      'CREATE INDEX IF NOT EXISTS "AuditLog_actorEmail_trgm" ON "AuditLog" USING gin ("actorEmail" gin_trgm_ops)',
      'CREATE INDEX IF NOT EXISTS "AuditLog_requestId_trgm" ON "AuditLog" USING gin ("requestId" gin_trgm_ops)',
      'CREATE INDEX IF NOT EXISTS "AuditLog_action_trgm" ON "AuditLog" USING gin ("action" gin_trgm_ops)',
      'CREATE INDEX IF NOT EXISTS "User_nickname_trgm" ON "User" USING gin ("nickname" gin_trgm_ops)',
      'CREATE INDEX IF NOT EXISTS "JobApplication_name_trgm" ON "JobApplication" USING gin ("name" gin_trgm_ops)',
      'CREATE INDEX IF NOT EXISTS "ContactMessage_content_trgm" ON "ContactMessage" USING gin ("content" gin_trgm_ops)',
      'CREATE INDEX IF NOT EXISTS "PointRedemption_productName_trgm" ON "PointRedemption" USING gin ("productName" gin_trgm_ops)',
      'CREATE INDEX IF NOT EXISTS "SpentAdjustmentApplication_orderNo_trgm" ON "SpentAdjustmentApplication" USING gin ("orderNo" gin_trgm_ops)',
      'CREATE INDEX IF NOT EXISTS "Product_name_trgm" ON "Product" USING gin ("name" gin_trgm_ops)',
      'CREATE INDEX IF NOT EXISTS "Product_nameEn_trgm" ON "Product" USING gin ("nameEn" gin_trgm_ops)',
      'CREATE INDEX IF NOT EXISTS "Product_slug_trgm" ON "Product" USING gin ("slug" gin_trgm_ops)'
    ] LOOP
      EXECUTE stmt;
    END LOOP;
  END IF;
END $$;

-- ============================================
-- 审计日志组合索引
-- ============================================

CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_id_idx"
  ON "AuditLog"("createdAt" DESC, "id" ASC);
CREATE INDEX IF NOT EXISTS "AuditLog_category_createdAt_idx"
  ON "AuditLog"("category", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AuditLog_source_createdAt_idx"
  ON "AuditLog"("source", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AuditLog_authMethod_createdAt_idx"
  ON "AuditLog"("authMethod", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AuditLog_ipAddress_createdAt_idx"
  ON "AuditLog"("ipAddress", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AuditLog_action_adminId_createdAt_idx"
  ON "AuditLog"("action", "adminId", "createdAt" DESC);

-- ============================================
-- 其他管理端列表/清理组合索引
-- ============================================

CREATE INDEX IF NOT EXISTS "Admin_deletedAt_createdAt_idx"
  ON "Admin"("deletedAt", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "AccountDeletionRequest_status_requestedAt_idx"
  ON "AccountDeletionRequest"("status", "requestedAt" DESC);

CREATE INDEX IF NOT EXISTS "NotificationOutbox_status_updatedAt_idx"
  ON "NotificationOutbox"("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "NotificationOutbox_createdAt_idx"
  ON "NotificationOutbox"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "NotificationOutbox_status_createdAt_idx"
  ON "NotificationOutbox"("status", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "RefreshToken_revokedAt_expiresAt_clientId_idx"
  ON "RefreshToken"("revokedAt", "expiresAt", "clientId");

CREATE INDEX IF NOT EXISTS "PointLedger_expiresAt_remaining_idx"
  ON "PointLedger"("expiresAt") WHERE "remaining" > 0;
CREATE INDEX IF NOT EXISTS "PointLedger_type_createdAt_idx"
  ON "PointLedger"("type", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "SpentImportRow_batchId_createdAt_idx"
  ON "SpentImportRow"("batchId", "createdAt");
CREATE INDEX IF NOT EXISTS "SpentImportRow_status_revertedAt_orderNoKey_idx"
  ON "SpentImportRow"("status", "revertedAt", "orderNoKey");

CREATE INDEX IF NOT EXISTS "AdminApprovalRequest_status_expiresAt_pending_idx"
  ON "AdminApprovalRequest"("status", "expiresAt") WHERE "status" = 'PENDING';

CREATE INDEX IF NOT EXISTS "JobApplication_folderId_status_createdAt_idx"
  ON "JobApplication"("folderId", "status", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "AuditExportJob_createdAt_idx"
  ON "AuditExportJob"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AuditRetentionJob_createdAt_idx"
  ON "AuditRetentionJob"("createdAt" DESC);

CREATE INDEX IF NOT EXISTS "User_createdAt_id_idx"
  ON "User"("createdAt" DESC, "id" ASC);
CREATE INDEX IF NOT EXISTS "User_status_createdAt_id_idx"
  ON "User"("status", "createdAt" DESC, "id" ASC);
