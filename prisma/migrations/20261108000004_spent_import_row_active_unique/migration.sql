-- 同一用户同一内容指纹只允许一条成功未撤销的导入行。
-- 若历史数据存在重复，请先执行：
--   npm run spent:audit-refunds
--   npm run spent:repair-refunds -- --apply --confirm=APPLY
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "SpentImportRow"
    WHERE "status" = 'SUCCESS'
      AND "revertedAt" IS NULL
      AND "syncReference" IS NOT NULL
    GROUP BY "userId", "syncReference"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'SpentImportRow 存在重复成功退款行，请先运行 spent:repair-refunds';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "SpentImportRow_userId_syncReference_active_key"
  ON "SpentImportRow"("userId", "syncReference")
  WHERE "status" = 'SUCCESS'
    AND "revertedAt" IS NULL
    AND "syncReference" IS NOT NULL;
