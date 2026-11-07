-- 审批去重 / 导出过期 / 清理过期查询索引
CREATE INDEX IF NOT EXISTS "AdminApprovalRequest_policyKey_targetId_payloadHash_status_idx"
  ON "AdminApprovalRequest"("policyKey", "targetId", "payloadHash", "status");

CREATE INDEX IF NOT EXISTS "AuditExportJob_status_expiresAt_idx"
  ON "AuditExportJob"("status", "expiresAt");

CREATE INDEX IF NOT EXISTS "AuditRetentionJob_status_expiresAt_idx"
  ON "AuditRetentionJob"("status", "expiresAt");
