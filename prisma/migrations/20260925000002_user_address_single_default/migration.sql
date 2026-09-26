-- 收货地址：每个用户最多一条默认地址（DB 级不变量）。
--
-- 背景：地址增删改的"取消其他默认 + 设为默认"在应用层分多步执行，并发下可能出现
-- 同一用户多条 isDefault=true（或第一条不再默认），此处用部分唯一索引兜底。
--
-- 存量去重：每个用户仅保留最早的一条默认地址，其余置为 false，
-- 否则唯一索引创建会因重复键失败。
UPDATE "UserAddress" ua
SET "isDefault" = false
WHERE ua."isDefault" = true
  AND ua."id" <> (
    SELECT u2."id"
    FROM "UserAddress" u2
    WHERE u2."userId" = ua."userId" AND u2."isDefault" = true
    ORDER BY u2."createdAt" ASC, u2."id" ASC
    LIMIT 1
  );

CREATE UNIQUE INDEX IF NOT EXISTS "UserAddress_userId_default_key"
  ON "UserAddress"("userId")
  WHERE "isDefault" = true;
