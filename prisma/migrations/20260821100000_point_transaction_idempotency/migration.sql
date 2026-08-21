-- PointTransaction 幂等唯一约束：(userId, type, reference)
-- 用于生日礼防并发双发（reference = BIRTHDAY-{年份}）
-- Postgres 唯一索引中 NULL 值互不冲突，reference 为空的流水不受影响
CREATE UNIQUE INDEX "PointTransaction_userId_type_reference_key"
  ON "PointTransaction"("userId", "type", "reference");
