-- 审计到期清理专用角色。
-- 使用前把 CHANGE_ME 换成强随机密码，并把连接串写入
-- /etc/nihplod/audit-retention.env（root 0600），Web 进程不要读取该文件。
--
-- 执行：
--   sudo -u postgres psql -d nihplod_db -f scripts/create-audit-retention-role.sql
--
-- 说明：
-- - audit_retention 不是表 owner，不能 DDL，也不能禁用触发器。
-- - 只有该角色可以 DELETE "AuditLog" / "SsoAuditEvent"（见迁移触发器）。
-- - 该角色需要 INSERT "AuditLog"，用于记录每次清理结果。
-- - 本脚本可以在 prisma migrate deploy 之前或之后执行；表不存在时只创建角色，
--   迁移完成后重新执行即可补齐表授权。

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_retention') THEN
    CREATE ROLE audit_retention LOGIN PASSWORD 'CHANGE_ME';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE nihplod_db TO audit_retention;
GRANT USAGE ON SCHEMA public TO audit_retention;
REVOKE CREATE ON SCHEMA public FROM audit_retention;

DO $$
BEGIN
  IF to_regclass('public."AuditLog"') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, DELETE ON "AuditLog" TO audit_retention';
    EXECUTE 'REVOKE UPDATE ON "AuditLog" FROM audit_retention';
  END IF;

  IF to_regclass('public."SsoAuditEvent"') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, DELETE ON "SsoAuditEvent" TO audit_retention';
    EXECUTE 'REVOKE UPDATE ON "SsoAuditEvent" FROM audit_retention';
  END IF;

  IF to_regclass('public."AuditRetentionJob"') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON "AuditRetentionJob" TO audit_retention';
  END IF;

  IF to_regclass('public."AuditLegalHold"') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON "AuditLegalHold" TO audit_retention';
  END IF;

  IF to_regclass('public."AuditLogAnchor"') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON "AuditLogAnchor" TO audit_retention';
  END IF;
END
$$;
