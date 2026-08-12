-- OAuthClient 补齐缺失列
-- 背景：OAuthClient 表最初由 db push 创建（无 CREATE TABLE 迁移），
-- 后续 schema 新增字段未全部生成迁移，导致生产库缺列引发
-- PrismaClientKnownRequestError: column does not exist。
-- 使用 IF NOT EXISTS 保证幂等：已存在的列（如曾手动补过）不会报错。

ALTER TABLE "OAuthClient" ADD COLUMN IF NOT EXISTS "codeTtlSeconds" INTEGER NOT NULL DEFAULT 300;
ALTER TABLE "OAuthClient" ADD COLUMN IF NOT EXISTS "accessTokenTtlSeconds" INTEGER NOT NULL DEFAULT 900;
ALTER TABLE "OAuthClient" ADD COLUMN IF NOT EXISTS "postLogoutRedirectUris" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "OAuthClient" ADD COLUMN IF NOT EXISTS "backchannelLogoutUri" TEXT;
ALTER TABLE "OAuthClient" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- 与 schema 中 @@index([tenantId]) 对齐
CREATE INDEX IF NOT EXISTS "OAuthClient_tenantId_idx" ON "OAuthClient"("tenantId");
