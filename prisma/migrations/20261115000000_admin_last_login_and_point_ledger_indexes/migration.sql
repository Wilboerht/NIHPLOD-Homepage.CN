-- 管理员最近登录时间（用于安全状态列）
ALTER TABLE "Admin" ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- 全局积分流水页：按时间与类型筛选
CREATE INDEX IF NOT EXISTS "PointLedger_createdAt_idx" ON "PointLedger"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "PointLedger_type_createdAt_idx" ON "PointLedger"("type", "createdAt" DESC);
