-- ============================================
-- 消费补录申请（全渠道凭证 → 人工审核 → 手动累加历史消费金额）
-- ============================================

-- 1. 新建枚举
CREATE TYPE "SpentAdjustmentChannel" AS ENUM ('TMALL', 'JD', 'MINIPROGRAM', 'OFFLINE', 'OTHER');

CREATE TYPE "SpentAdjustmentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- 2. 新建申请表
CREATE TABLE "SpentAdjustmentApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "SpentAdjustmentChannel" NOT NULL,
    "orderNo" TEXT NOT NULL,
    "amountClaimed" INTEGER,
    "purchasedAt" TIMESTAMP(3),
    "images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "note" TEXT,
    "status" "SpentAdjustmentStatus" NOT NULL DEFAULT 'PENDING',
    "reviewAmount" INTEGER,
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpentAdjustmentApplication_pkey" PRIMARY KEY ("id")
);

-- 3. 索引
CREATE INDEX "SpentAdjustmentApplication_userId_createdAt_idx"
    ON "SpentAdjustmentApplication"("userId", "createdAt" DESC);

CREATE INDEX "SpentAdjustmentApplication_status_createdAt_idx"
    ON "SpentAdjustmentApplication"("status", "createdAt" DESC);

-- partial unique index：待审/已通过状态下的订单号全局唯一（防一单多报）；
-- 驳回（REJECTED）后同一订单号可重新提交，不受约束。
CREATE UNIQUE INDEX "SpentAdjustmentApplication_active_orderNo_key"
    ON "SpentAdjustmentApplication"("orderNo")
    WHERE "status" IN ('PENDING', 'APPROVED');

-- 4. 外键
ALTER TABLE "SpentAdjustmentApplication" ADD CONSTRAINT "SpentAdjustmentApplication_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SpentAdjustmentApplication" ADD CONSTRAINT "SpentAdjustmentApplication_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "Admin"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
