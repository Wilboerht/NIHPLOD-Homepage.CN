-- ============================================
-- 积分礼品兑换（官网维护礼品目录，用户面板兑换，管理端履约）
-- ============================================

-- 1. 兑换履约状态枚举
CREATE TYPE "PointRedemptionStatus" AS ENUM ('PENDING', 'FULFILLED', 'CANCELLED');

-- 2. 礼品目录（下架 = active=false，不物理删除）
CREATE TABLE "PointGift" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "valueYuan" INTEGER NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PointGift_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PointGift_active_sort_idx" ON "PointGift"("active", "sort");

-- 3. 兑换记录（快照 + 幂等键 + 履约状态）
CREATE TABLE "PointRedemption" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "giftId" TEXT,
    "giftName" TEXT NOT NULL,
    "valueYuan" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "status" "PointRedemptionStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT NOT NULL,
    "fulfilledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PointRedemption_userId_reference_key"
    ON "PointRedemption"("userId", "reference");

CREATE INDEX "PointRedemption_status_createdAt_idx"
    ON "PointRedemption"("status", "createdAt" DESC);

CREATE INDEX "PointRedemption_userId_createdAt_idx"
    ON "PointRedemption"("userId", "createdAt" DESC);

ALTER TABLE "PointRedemption" ADD CONSTRAINT "PointRedemption_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PointRedemption" ADD CONSTRAINT "PointRedemption_giftId_fkey"
    FOREIGN KEY ("giftId") REFERENCES "PointGift"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
