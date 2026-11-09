-- 事务性通知 Outbox
CREATE TYPE "NotificationChannel" AS ENUM ('SMS', 'WECHAT_TEMPLATE', 'MINIPROGRAM', 'WECOM');
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'DEAD', 'SKIPPED');

CREATE TABLE "NotificationOutbox" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT,
    "aggregateId" TEXT,
    "userId" TEXT,
    "recipient" JSONB,
    "templateKey" TEXT,
    "payload" JSONB NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 6,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationOutbox_idempotencyKey_key"
  ON "NotificationOutbox"("idempotencyKey");
CREATE INDEX "NotificationOutbox_status_nextAttemptAt_idx"
  ON "NotificationOutbox"("status", "nextAttemptAt");
CREATE INDEX "NotificationOutbox_userId_createdAt_idx"
  ON "NotificationOutbox"("userId", "createdAt" DESC);
CREATE INDEX "NotificationOutbox_aggregateType_aggregateId_idx"
  ON "NotificationOutbox"("aggregateType", "aggregateId");
CREATE INDEX "NotificationOutbox_channel_status_idx"
  ON "NotificationOutbox"("channel", "status");
