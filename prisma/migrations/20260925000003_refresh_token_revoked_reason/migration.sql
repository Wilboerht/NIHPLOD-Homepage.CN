-- 刷新令牌撤销原因：设备数超限自动淘汰时标记，便于被淘汰设备收到"设备数已达上限"专属提示
ALTER TABLE "RefreshToken" ADD COLUMN IF NOT EXISTS "revokedReason" TEXT;
