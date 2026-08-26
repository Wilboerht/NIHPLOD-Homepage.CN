-- OAuthClient.webhookUri + WebhookDeliveryFailure 表
-- 背景：子项目此前只能轮询拉取用户资料，资料变更后缓存滞后。
-- 新增 webhookUri 字段用于配置"用户资料变更"推送地址（可空，未配置则不推送）；
-- WebhookDeliveryFailure 为 webhook 投递失败补偿队列，与 BackchannelLogoutFailure
-- 并列（logout 专用，不混用），同步重试耗尽后落库，由 cron 任务按 nextRetryAt
-- 指数退避周期重投，成功或超上限后删除。
-- IF NOT EXISTS 保证在已通过 db push 补过的环境（如本地开发库）上重放安全。

-- AlterTable
ALTER TABLE "OAuthClient" ADD COLUMN IF NOT EXISTS "webhookUri" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "WebhookDeliveryFailure" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookDeliveryFailure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WebhookDeliveryFailure_nextRetryAt_idx" ON "WebhookDeliveryFailure"("nextRetryAt");
