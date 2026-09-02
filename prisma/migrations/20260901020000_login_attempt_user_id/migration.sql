-- ============================================
-- 登录历史升级为账号维度：LoginAttempt 增加 userId
-- 新记录按账号（userId）聚合，换绑手机号后历史不丢失；
-- 历史行无 userId（HMAC 哈希不可逆，无法回填），由 identifier 查询兜底，
-- 随 7 天清理自然过期。
-- ============================================

ALTER TABLE "LoginAttempt" ADD COLUMN "userId" TEXT;

CREATE INDEX "LoginAttempt_userId_createdAt_idx"
    ON "LoginAttempt"("userId", "createdAt" DESC);

ALTER TABLE "LoginAttempt" ADD CONSTRAINT "LoginAttempt_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
