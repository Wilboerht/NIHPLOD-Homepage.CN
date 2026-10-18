-- 管理端高频列表/排序索引
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt" DESC);
CREATE INDEX "User_status_createdAt_idx" ON "User"("status", "createdAt" DESC);

CREATE INDEX "SpentAdjustmentApplication_createdAt_idx"
  ON "SpentAdjustmentApplication"("createdAt" DESC);

CREATE INDEX "PointRedemption_createdAt_idx"
  ON "PointRedemption"("createdAt" DESC);

CREATE INDEX "JobApplication_createdAt_idx"
  ON "JobApplication"("createdAt" DESC);

CREATE INDEX "AuditLog_targetType_createdAt_idx"
  ON "AuditLog"("targetType", "createdAt" DESC);

CREATE INDEX "UserConsent_grantedAt_idx"
  ON "UserConsent"("grantedAt" DESC);
CREATE INDEX "UserConsent_clientId_revokedAt_grantedAt_idx"
  ON "UserConsent"("clientId", "revokedAt", "grantedAt");

CREATE INDEX "OAuthSession_revokedAt_expiresAt_createdAt_idx"
  ON "OAuthSession"("revokedAt", "expiresAt", "createdAt");
