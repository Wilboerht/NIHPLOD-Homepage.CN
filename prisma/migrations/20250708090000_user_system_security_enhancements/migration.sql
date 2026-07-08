-- 用户系统安全加固迁移
-- 包含：用户状态、验证码哈希、RefreshToken 设备信息、管理员 TOTP、审计日志 userId、数据库限流表

-- 1. C 端用户状态
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BANNED');
ALTER TABLE "User" ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';
CREATE INDEX "User_status_idx" ON "User"("status");

-- 2. RefreshToken 设备/会话信息
ALTER TABLE "RefreshToken" ADD COLUMN "deviceName" TEXT;
ALTER TABLE "RefreshToken" ADD COLUMN "deviceInfo" TEXT;
ALTER TABLE "RefreshToken" ADD COLUMN "ipAddress" TEXT;
ALTER TABLE "RefreshToken" ADD COLUMN "userAgent" TEXT;
ALTER TABLE "RefreshToken" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "RefreshToken_userId_revokedAt_expiresAt_idx" ON "RefreshToken"("userId", "revokedAt", "expiresAt");

-- 3. 短信验证码哈希字段（保留明文 code 用于兼容）
ALTER TABLE "SmsCode" ADD COLUMN "codeHash" TEXT;

-- 4. 管理员 TOTP 字段
ALTER TABLE "Admin" ADD COLUMN "totpSecret" TEXT;
ALTER TABLE "Admin" ADD COLUMN "totpEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Admin" ADD COLUMN "totpBackupCodes" TEXT;

-- 5. 审计日志增加 C 端用户关联
ALTER TABLE "AuditLog" ADD COLUMN "userId" TEXT;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt" DESC);

-- 6. 数据库限流记录表
CREATE TABLE "RateLimitRecord" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RateLimitRecord_key_windowStart_idx" ON "RateLimitRecord"("key", "windowStart");

