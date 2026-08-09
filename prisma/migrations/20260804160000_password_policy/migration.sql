-- 密码策略增强：密码历史、过期时间

-- 用户表增加密码策略字段
DO $$ BEGIN
  ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "User" ADD COLUMN "passwordExpiresAt" TIMESTAMP(3);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 创建密码历史表
CREATE TABLE IF NOT EXISTS "PasswordHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordHistory_pkey" PRIMARY KEY ("id")
);

-- 创建外键与索引
DO $$ BEGIN
  CREATE INDEX "PasswordHistory_userId_createdAt_idx" ON "PasswordHistory"("userId", "createdAt" DESC);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PasswordHistory" ADD CONSTRAINT "PasswordHistory_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 用户密码过期时间索引（用于批量提醒过期账户）
DO $$ BEGIN
  CREATE INDEX "User_passwordExpiresAt_idx" ON "User"("passwordExpiresAt");
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;
