-- 管理员 TOTP 绑定时间（启用/重绑时写入，关闭后置空）
ALTER TABLE "Admin" ADD COLUMN "totpEnabledAt" TIMESTAMP(3);
