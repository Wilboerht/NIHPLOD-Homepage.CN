-- Phase 2：命名角色 + 个人权限覆盖
-- 1) 角色枚举扩展（历史值 owner/admin 保留）
ALTER TYPE "AdminRole" ADD VALUE 'ops';
ALTER TYPE "AdminRole" ADD VALUE 'support';
ALTER TYPE "AdminRole" ADD VALUE 'hr';
ALTER TYPE "AdminRole" ADD VALUE 'finance';

-- 2) 个人权限覆盖：追加授权为普通条目，撤销为 "!权限点" 前缀
ALTER TABLE "Admin" ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
