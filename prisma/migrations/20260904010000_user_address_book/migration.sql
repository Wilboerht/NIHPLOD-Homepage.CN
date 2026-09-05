-- ============================================
-- 收货地址簿（方案 B：积分兑礼履约寄送）
-- UserAddress 多地址 + 默认地址；PointRedemption 增加收货快照列
-- ============================================

CREATE TABLE "UserAddress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAddress_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserAddress_userId_idx" ON "UserAddress"("userId");

ALTER TABLE "UserAddress" ADD CONSTRAINT "UserAddress_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 兑换记录收货快照（履约寄送；事后修改地址簿不影响历史订单）
ALTER TABLE "PointRedemption" ADD COLUMN "recipient" TEXT;
ALTER TABLE "PointRedemption" ADD COLUMN "phone" TEXT;
ALTER TABLE "PointRedemption" ADD COLUMN "address" TEXT;
