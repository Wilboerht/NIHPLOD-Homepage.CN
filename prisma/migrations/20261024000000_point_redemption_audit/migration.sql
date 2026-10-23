-- 积分兑换审计字段：等级/兑礼率/来源客户端/取消时间与原因
ALTER TABLE "PointRedemption"
  ADD COLUMN "level" "MembershipLevel",
  ADD COLUMN "redeemRate" DECIMAL(4,2),
  ADD COLUMN "clientId" TEXT,
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelNote" TEXT;

-- 过期任务扫描（type IN (...) AND remaining > 0 AND expiresAt <= now）的前导索引
CREATE INDEX "PointLedger_expiresAt_idx" ON "PointLedger"("expiresAt");
