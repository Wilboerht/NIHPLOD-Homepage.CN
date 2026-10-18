-- 管理员会话版本：改密/改角色/改权限/禁用/删除时递增
ALTER TABLE "Admin" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
