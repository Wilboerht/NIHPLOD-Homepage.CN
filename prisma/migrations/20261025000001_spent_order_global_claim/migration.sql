-- 消费订单占用改为全局唯一（orderNoKey），防止不同用户重复提交同一订单号。
-- 上线前请先运行只读检查；若存在重复 orderNoKey，本迁移会失败，需要人工处理。
DO $$
DECLARE
  duplicate_count integer;
BEGIN
  SELECT count(*) INTO duplicate_count
  FROM (
    SELECT "orderNoKey"
    FROM "SpentOrderClaim"
    GROUP BY "orderNoKey"
    HAVING count(*) > 1
  ) duplicates;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION
      'SpentOrderClaim 存在 % 个重复 orderNoKey，请先人工清理后再执行全局唯一迁移',
      duplicate_count;
  END IF;
END $$;

ALTER TABLE "SpentOrderClaim"
  DROP CONSTRAINT IF EXISTS "SpentOrderClaim_userId_orderNoKey_key";
DROP INDEX IF EXISTS "SpentOrderClaim_userId_orderNoKey_key";

CREATE UNIQUE INDEX IF NOT EXISTS "SpentOrderClaim_orderNoKey_key"
  ON "SpentOrderClaim" ("orderNoKey");

CREATE INDEX IF NOT EXISTS "SpentOrderClaim_userId_idx"
  ON "SpentOrderClaim" ("userId");
