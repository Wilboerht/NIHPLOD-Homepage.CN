-- 恢复 OAuth/OIDC 数据库级唯一约束。
--
-- 背景：迁移 20260801181026_security_ui_improvements 执行了
--   DROP INDEX IF EXISTS "OAuthAuthorizationCode_code_key";
--   DROP INDEX IF EXISTS "OAuthSession_sessionId_key";
-- 其后没有任何迁移重建这两个 @unique 索引，导致迁移管理的库上数据库级唯一性丢失
-- （Prisma findUnique 语义依赖该唯一性；应用层虽有 SHA-256/UUID 兜底，仍需数据库约束）。
--
-- 说明：
-- - 全新库由基线 0_init 创建，本迁移为空操作（IF NOT EXISTS）。
-- - 若本迁移因 "duplicate key value" 失败，请先人工核对并清理重复行后重跑，切勿跳过。
CREATE UNIQUE INDEX IF NOT EXISTS "OAuthAuthorizationCode_code_key"
  ON "OAuthAuthorizationCode"("code");

CREATE UNIQUE INDEX IF NOT EXISTS "OAuthSession_sessionId_key"
  ON "OAuthSession"("sessionId");
