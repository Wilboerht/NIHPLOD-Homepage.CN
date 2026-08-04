-- 密码策略增强：密码历史、过期时间

-- 用户表增加密码策略字段
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordExpiresAt" TIMESTAMP(3);

-- 创建密码历史表
CREATE TABLE IF NOT EXISTS "PasswordHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordHistory_pkey" PRIMARY KEY ("id")
);

-- 创建外键与索引
CREATE INDEX IF NOT EXISTS "PasswordHistory_userId_createdAt_idx" ON "PasswordHistory"("userId", "createdAt" DESC);

ALTER TABLE "PasswordHistory" ADD CONSTRAINT IF NOT EXISTS "PasswordHistory_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 用户密码过期时间索引（用于批量提醒过期账户）
CREATE INDEX IF NOT EXISTS "User_passwordExpiresAt_idx" ON "User"("passwordExpiresAt");
