-- ============================================
-- 积分兑换（兑换产品复用产品库：Product.pointRedeemable 标记可兑换，
-- 用户面板兑换，管理端履约）
-- ============================================

-- 1. 产品库新增"积分可兑"标记（仅已发布且标记的产品出现在兑换板块）
ALTER TABLE "Product" ADD COLUMN "pointRedeemable" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Product_pointRedeemable_published_idx"
    ON "Product"("pointRedeemable", "published");

-- 2. 兑换履约状态枚举
CREATE TYPE "PointRedemptionStatus" AS ENUM ('PENDING', 'FULFILLED', 'CANCELLED');

-- 3. 兑换记录（产品名称/价格/扣分快照 + 幂等键 + 履约状态）
CREATE TABLE "PointRedemption" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "priceYuan" DECIMAL(10,2) NOT NULL,
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

ALTER TABLE "PointRedemption" ADD CONSTRAINT "PointRedemption_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
