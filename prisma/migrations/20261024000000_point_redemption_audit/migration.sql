-- 积分兑换审计字段：等级/兑礼率/来源客户端/取消时间与原因
ALTER TABLE "PointRedemption"
  ADD COLUMN "level" "MembershipLevel",
  ADD COLUMN "redeemRate" DECIMAL(4,2),
  ADD COLUMN "clientId" TEXT,
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelNote" TEXT;

-- 过期任务扫描（type IN (...) AND remaining > 0 AND expiresAt <= now）的前导索引。
-- IF NOT EXISTS 允许在低峰期先用 CREATE INDEX CONCURRENTLY 预建，避免 migrate 时锁表写。
CREATE INDEX IF NOT EXISTS "PointLedger_expiresAt_idx" ON "PointLedger"("expiresAt");
