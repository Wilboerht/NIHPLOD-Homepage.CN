-- ============================================
-- 积分体系下线：删除积分账本表与余额字段，
-- 消费额同步幂等改为专用记录表（SpentSyncRecord）
-- ============================================

-- 1. 删除积分流水表（积分体系已整体移除）
DROP TABLE IF EXISTS "PointTransaction";

-- 2. 删除用户积分余额字段
ALTER TABLE "User" DROP COLUMN IF EXISTS "totalPoints";

-- 3. 新建消费额同步幂等记录表（商城侧单据号唯一，防止重复上报重复入账）
CREATE TABLE "SpentSyncRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "spentDelta" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpentSyncRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SpentSyncRecord_userId_reference_key"
    ON "SpentSyncRecord"("userId", "reference");

CREATE INDEX "SpentSyncRecord_userId_createdAt_idx"
    ON "SpentSyncRecord"("userId", "createdAt" DESC);

ALTER TABLE "SpentSyncRecord" ADD CONSTRAINT "SpentSyncRecord_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
