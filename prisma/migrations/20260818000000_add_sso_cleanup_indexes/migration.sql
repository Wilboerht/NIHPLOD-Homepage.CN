-- SSO 清理任务索引
-- 背景：cron 清理任务按 revokedAt/expiresAt/createdAt 做范围删除，
-- OAuthSession 缺 revokedAt 单列索引、SsoAuditEvent 缺 createdAt 单列索引，
-- 数据量增长后清理查询会全表扫描。

-- CreateIndex
CREATE INDEX "OAuthSession_revokedAt_idx" ON "OAuthSession"("revokedAt");

-- CreateIndex
CREATE INDEX "SsoAuditEvent_createdAt_idx" ON "SsoAuditEvent"("createdAt");
