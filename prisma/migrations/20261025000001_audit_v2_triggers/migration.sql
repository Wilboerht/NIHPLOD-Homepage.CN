-- 审计 v2：不可变约束
-- audit_retention 角色由 scripts/create-audit-retention-role.sql 创建；
-- 角色尚未创建时，普通业务角色仍会被触发器拒绝。

CREATE OR REPLACE FUNCTION "audit_log_guard_update"() RETURNS trigger AS $$
BEGIN
  -- 一次性回填允许：历史行 entryHash 为空时可写链字段；回填完成后自动收紧。
  IF OLD."outcome" <> 'PENDING' AND OLD."entryHash" IS NOT NULL THEN
    RAISE EXCEPTION 'Finalized audit log is immutable';
  END IF;
  IF NEW."outcome" = 'PENDING' THEN
    RAISE EXCEPTION 'Audit outcome must be finalized';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."action" IS DISTINCT FROM OLD."action"
     OR NEW."targetType" IS DISTINCT FROM OLD."targetType"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR NEW."actorType" IS DISTINCT FROM OLD."actorType" THEN
    RAISE EXCEPTION 'Immutable audit fields cannot change';
  END IF;
  IF OLD."entryHash" IS NOT NULL AND (
     NEW."chainVersion" IS DISTINCT FROM OLD."chainVersion"
     OR NEW."integrityKeyVersion" IS DISTINCT FROM OLD."integrityKeyVersion"
     OR NEW."chainSeq" IS DISTINCT FROM OLD."chainSeq"
     OR NEW."prevHash" IS DISTINCT FROM OLD."prevHash"
     OR NEW."entryHash" IS DISTINCT FROM OLD."entryHash"
     OR NEW."requestId" IS DISTINCT FROM OLD."requestId"
     OR NEW."adminId" IS DISTINCT FROM OLD."adminId"
     OR NEW."userId" IS DISTINCT FROM OLD."userId"
  ) THEN
    RAISE EXCEPTION 'Immutable audit fields cannot change';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "audit_log_guard_delete"() RETURNS trigger AS $$
BEGIN
  IF current_user <> 'audit_retention' THEN
    RAISE EXCEPTION 'AuditLog is append-only; deletion requires audit_retention role';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "AuditLog_guard_update" ON "AuditLog";
CREATE TRIGGER "AuditLog_guard_update"
  BEFORE UPDATE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION "audit_log_guard_update"();

DROP TRIGGER IF EXISTS "AuditLog_guard_delete" ON "AuditLog";
CREATE TRIGGER "AuditLog_guard_delete"
  BEFORE DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION "audit_log_guard_delete"();

CREATE OR REPLACE FUNCTION "sso_audit_guard_update"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'SsoAuditEvent is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "sso_audit_guard_delete"() RETURNS trigger AS $$
BEGIN
  IF current_user <> 'audit_retention' THEN
    RAISE EXCEPTION 'SsoAuditEvent is append-only; deletion requires audit_retention role';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "SsoAuditEvent_guard_update" ON "SsoAuditEvent";
CREATE TRIGGER "SsoAuditEvent_guard_update"
  BEFORE UPDATE ON "SsoAuditEvent"
  FOR EACH ROW EXECUTE FUNCTION "sso_audit_guard_update"();

DROP TRIGGER IF EXISTS "SsoAuditEvent_guard_delete" ON "SsoAuditEvent";
CREATE TRIGGER "SsoAuditEvent_guard_delete"
  BEFORE DELETE ON "SsoAuditEvent"
  FOR EACH ROW EXECUTE FUNCTION "sso_audit_guard_delete"();

CREATE OR REPLACE FUNCTION "audit_anchor_guard_update"() RETURNS trigger AS $$
BEGIN
  IF NEW."day" IS DISTINCT FROM OLD."day"
     OR NEW."stream" IS DISTINCT FROM OLD."stream"
     OR NEW."signatureVersion" IS DISTINCT FROM OLD."signatureVersion"
     OR NEW."keyVersion" IS DISTINCT FROM OLD."keyVersion"
     OR NEW."fromAt" IS DISTINCT FROM OLD."fromAt"
     OR NEW."toAt" IS DISTINCT FROM OLD."toAt"
     OR NEW."count" IS DISTINCT FROM OLD."count"
     OR NEW."digest" IS DISTINCT FROM OLD."digest"
     OR NEW."signature" IS DISTINCT FROM OLD."signature"
     OR NEW."prevAnchorHash" IS DISTINCT FROM OLD."prevAnchorHash"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Audit anchor digest/signature is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "audit_anchor_guard_delete"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLogAnchor cannot be deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "AuditLogAnchor_guard_update" ON "AuditLogAnchor";
CREATE TRIGGER "AuditLogAnchor_guard_update"
  BEFORE UPDATE ON "AuditLogAnchor"
  FOR EACH ROW EXECUTE FUNCTION "audit_anchor_guard_update"();

DROP TRIGGER IF EXISTS "AuditLogAnchor_guard_delete" ON "AuditLogAnchor";
CREATE TRIGGER "AuditLogAnchor_guard_delete"
  BEFORE DELETE ON "AuditLogAnchor"
  FOR EACH ROW EXECUTE FUNCTION "audit_anchor_guard_delete"();
