-- 账号自助注销（阶段 3.1：数据模型 + Cascade 收口）
-- 设计稿：docs/account-deletion-plan.md

-- 1. UserStatus 新增 DELETED（注销匿名化后的终态）
-- 注意：PostgreSQL 不允许新增枚举值在同一事务内被使用，本迁移仅添加值、不在此处写入
-- 'DELETED'，应用层在执行注销任务时才使用该值，无冲突。
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'DELETED';

-- 2. 注销申请表（同一用户仅一条；撤回/完成后再次申请原位重置为 PENDING）
CREATE TABLE "AccountDeletionRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "AccountDeletionRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountDeletionRequest_userId_key" ON "AccountDeletionRequest"("userId");
CREATE INDEX "AccountDeletionRequest_status_scheduledAt_idx" ON "AccountDeletionRequest"("status", "scheduledAt");

ALTER TABLE "AccountDeletionRequest" ADD CONSTRAINT "AccountDeletionRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Cascade 收口：以下业务/资产类表禁止随 User 物理删除被级联清空，
--    强制走「匿名化保留 User 行」的注销路径，防止历史订单/积分流水外键断裂。
--    （会话类 RefreshToken/OAuthSession 等保持 CASCADE 不动，仅作防御层。）
ALTER TABLE "PointLedger" DROP CONSTRAINT "PointLedger_userId_fkey";
ALTER TABLE "PointLedger" ADD CONSTRAINT "PointLedger_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PointBalance" DROP CONSTRAINT "PointBalance_userId_fkey";
ALTER TABLE "PointBalance" ADD CONSTRAINT "PointBalance_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SpentSyncRecord" DROP CONSTRAINT "SpentSyncRecord_userId_fkey";
ALTER TABLE "SpentSyncRecord" ADD CONSTRAINT "SpentSyncRecord_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SpentAdjustmentApplication" DROP CONSTRAINT "SpentAdjustmentApplication_userId_fkey";
ALTER TABLE "SpentAdjustmentApplication" ADD CONSTRAINT "SpentAdjustmentApplication_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PointRedemption" DROP CONSTRAINT "PointRedemption_userId_fkey";
ALTER TABLE "PointRedemption" ADD CONSTRAINT "PointRedemption_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MembershipLevelChange" DROP CONSTRAINT "MembershipLevelChange_userId_fkey";
ALTER TABLE "MembershipLevelChange" ADD CONSTRAINT "MembershipLevelChange_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
