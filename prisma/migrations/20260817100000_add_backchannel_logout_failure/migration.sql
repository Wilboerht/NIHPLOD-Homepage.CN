-- Backchannel Logout 投递失败补偿队列
-- 背景：backchannel logout 同步重试 1 次失败后此前只写审计，RP 短暂故障期间
-- 的登出通知永久丢失。新增本表在重试耗尽后落库，由 cron 任务按
-- nextRetryAt 指数退避周期重投，成功或超上限后删除。

-- CreateTable
CREATE TABLE "BackchannelLogoutFailure" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackchannelLogoutFailure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BackchannelLogoutFailure_nextRetryAt_idx" ON "BackchannelLogoutFailure"("nextRetryAt");
