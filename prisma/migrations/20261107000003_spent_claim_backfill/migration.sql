-- 回填历史消费订单占用，防止历史商城/导入/补录订单被再次入账。
-- 1) 回填可安全更新的 orderNoKey
UPDATE "SpentSyncRecord"
SET "orderNoKey" = UPPER(TRIM("orderNo"))
WHERE "orderNo" IS NOT NULL AND "orderNoKey" IS NULL;

UPDATE "SpentImportRow" r
SET "orderNoKey" = UPPER(TRIM(r."orderNo"))
WHERE r."orderNo" IS NOT NULL
  AND r."orderNoKey" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "SpentImportRow" x
    WHERE x."userId" IS NOT DISTINCT FROM r."userId"
      AND x."status" = 'SUCCESS'
      AND x."revertedAt" IS NULL
      AND UPPER(TRIM(x."orderNo")) = UPPER(TRIM(r."orderNo"))
      AND x."id" <> r."id"
  );

-- 2) 从历史商城同步记录回填 claim
INSERT INTO "SpentOrderClaim" ("id", "userId", "orderNo", "orderNoKey", "source", "reference", "createdAt")
SELECT
  md5(random()::text || clock_timestamp()::text || s."id"),
  s."userId",
  s."orderNo",
  s."orderNoKey",
  COALESCE(s."source", 'MALL_SYNC'::"SpentOrderSource"),
  s."reference",
  s."createdAt"
FROM "SpentSyncRecord" s
WHERE s."spentDelta" > 0
  AND s."revertedAt" IS NULL
  AND s."orderNoKey" IS NOT NULL
ON CONFLICT ("orderNoKey") DO NOTHING;

-- 3) 从历史 Excel 导入成功行回填 claim
INSERT INTO "SpentOrderClaim" ("id", "userId", "orderNo", "orderNoKey", "source", "reference", "createdAt")
SELECT
  md5(random()::text || clock_timestamp()::text || r."id"),
  r."userId",
  r."orderNo",
  UPPER(TRIM(r."orderNo")),
  'SPENT_IMPORT'::"SpentOrderSource",
  r."reference",
  r."createdAt"
FROM "SpentImportRow" r
WHERE r."userId" IS NOT NULL
  AND r."orderNo" IS NOT NULL
  AND r."status" = 'SUCCESS'
  AND r."revertedAt" IS NULL
  AND COALESCE(r."appliedDelta", r."amount") > 0
ON CONFLICT ("orderNoKey") DO NOTHING;

-- 4) 从历史已通过的消费补录回填 claim
INSERT INTO "SpentOrderClaim" ("id", "userId", "orderNo", "orderNoKey", "source", "reference", "createdAt")
SELECT
  md5(random()::text || clock_timestamp()::text || a."id"),
  a."userId",
  a."orderNo",
  UPPER(TRIM(a."orderNo")),
  'SPENT_ADJUSTMENT'::"SpentOrderSource",
  'legacy-adjustment:' || a."id",
  a."createdAt"
FROM "SpentAdjustmentApplication" a
WHERE a."status" = 'APPROVED'
  AND a."orderNo" IS NOT NULL
  AND COALESCE(a."reviewAmount", a."amountClaimed", 0) > 0
ON CONFLICT ("orderNoKey") DO NOTHING;
