-- RateLimitRecord 增加 windowStart 单列索引
-- 定期清理过期限流记录的查询（deleteMany: windowStart < 阈值）此前只能走
-- @@unique([key, windowStart]) 复合索引的次级列，无法命中；补充单列索引后可正常扫描。

-- CreateIndex
CREATE INDEX "RateLimitRecord_windowStart_idx" ON "RateLimitRecord"("windowStart");
