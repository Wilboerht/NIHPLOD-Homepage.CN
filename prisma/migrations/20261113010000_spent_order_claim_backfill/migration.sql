-- 回填历史 SpentOrderClaim 的 originalAmount / refundedAmount。
-- 旧迁移只加了列，未回填，导致历史订单退款被 SPENT_REFUND_NOT_LINKED 拒绝。
-- 本迁移幂等：只更新 originalAmount IS NULL 的 claim，并按现有同步记录重算退款额。

UPDATE "SpentOrderClaim" c
SET "originalAmount" = sub.amount
FROM (
  SELECT "orderNoKey", SUM("spentDelta")::int AS amount
  FROM "SpentSyncRecord"
  WHERE "spentDelta" > 0
    AND "revertedAt" IS NULL
    AND "orderNoKey" IS NOT NULL
  GROUP BY "orderNoKey"
) sub
WHERE c."orderNoKey" = sub."orderNoKey"
  AND c."originalAmount" IS NULL;

UPDATE "SpentOrderClaim" c
SET "refundedAmount" = COALESCE(sub.amount, 0)
FROM (
  SELECT "orderNoKey", SUM(-"spentDelta")::int AS amount
  FROM "SpentSyncRecord"
  WHERE "spentDelta" < 0
    AND "revertedAt" IS NULL
    AND "orderNoKey" IS NOT NULL
  GROUP BY "orderNoKey"
) sub
WHERE c."orderNoKey" = sub."orderNoKey";
