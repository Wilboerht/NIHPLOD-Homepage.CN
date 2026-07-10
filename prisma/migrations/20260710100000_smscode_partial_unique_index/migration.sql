-- SmsCode 表增加 partial unique index
-- 确保同一 phone + type 组合在同一时间只有一个未使用的验证码
-- 防止并发发送时产生多条未使用记录

-- 清理已有的重复未使用验证码（仅保留最新一条）
DELETE FROM "SmsCode"
WHERE "id" NOT IN (
  SELECT "id" FROM (
    SELECT DISTINCT ON ("phone", "type") "id"
    FROM "SmsCode"
    WHERE "used" = false
    ORDER BY "phone", "type", "createdAt" DESC
  ) AS latest
)
AND "used" = false;

-- 创建 partial unique index: (phone, type) WHERE used = false
CREATE UNIQUE INDEX "SmsCode_phone_type_used_false_key"
  ON "SmsCode" ("phone", "type")
  WHERE "used" = false;
