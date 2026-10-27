-- 消费补录客户端幂等键：同一用户同一 requestId 只创建一条申请。
ALTER TABLE "SpentAdjustmentApplication"
  ADD COLUMN "requestId" TEXT;

CREATE UNIQUE INDEX "SpentAdjustmentApplication_userId_requestId_key"
  ON "SpentAdjustmentApplication"("userId", "requestId");
