-- 将 LoginAttempt.phone 重命名为 identifier，使其语义同时覆盖手机号和管理员邮箱

-- 重命名列（PostgreSQL 会自动更新关联的索引定义）
ALTER TABLE "LoginAttempt" RENAME COLUMN "phone" TO "identifier";

-- 为了保持索引名与字段名一致，重命名索引（IF EXISTS 避免首次执行时表/index 不存在）
ALTER INDEX IF EXISTS "_LoginAttempt_phone_createdAt_idx" RENAME TO "_LoginAttempt_identifier_createdAt_idx";
ALTER INDEX IF EXISTS "_LoginAttempt_phone_success_createdAt_idx" RENAME TO "_LoginAttempt_identifier_success_createdAt_idx";
