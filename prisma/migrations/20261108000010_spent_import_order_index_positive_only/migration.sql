-- 修复旧唯一索引误伤退款行：
-- 同一订单允许一条正向成功导入 + 多条退款行；退款行由 0004 的
-- SpentImportRow_userId_syncReference_active_key 负责幂等。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "SpentImportRow"
    WHERE "status" = 'SUCCESS'
      AND "revertedAt" IS NULL
      AND "orderNoKey" IS NOT NULL
      AND "amount" > 0
    GROUP BY "userId", "orderNoKey"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'SpentImportRow 存在重复正向导入行，请先人工核对后再执行迁移';
  END IF;
END $$;

DROP INDEX IF EXISTS "SpentImportRow_userId_orderNoKey_success_key";

CREATE UNIQUE INDEX "SpentImportRow_userId_orderNoKey_success_key"
  ON "SpentImportRow"("userId", "orderNoKey")
  WHERE "status" = 'SUCCESS'
    AND "revertedAt" IS NULL
    AND "orderNoKey" IS NOT NULL
    AND "amount" > 0;
