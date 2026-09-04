-- ============================================
-- 移除积分稳定期（冻结 7 天）：积分发放立即到账，兑换立即扣除
-- 存量数据补偿：未释放流水统一标记释放，冻结余额并入可用余额
-- 列保留（PointLedger.frozenUntil / PointBalance.frozen）向后兼容，新逻辑不再写入
-- ============================================

-- 1. 未释放的发放流水标记为已释放（释放时间取原解冻时间，兜底创建时间）
UPDATE "PointLedger"
SET "releasedAt" = COALESCE("frozenUntil", "createdAt")
WHERE "releasedAt" IS NULL
  AND "remaining" IS NOT NULL;

-- 2. 冻结余额并入可用余额（可用可负的规则不变）
UPDATE "PointBalance"
SET "available" = "available" + "frozen",
    "frozen" = 0
WHERE "frozen" > 0;
