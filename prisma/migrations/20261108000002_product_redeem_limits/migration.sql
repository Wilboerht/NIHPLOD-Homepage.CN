ALTER TABLE "Product"
  ADD COLUMN "redeemLimitPerUser" INTEGER,
  ADD COLUMN "redeemLimitWindowDays" INTEGER;

CREATE INDEX "PointRedemption_userId_productId_createdAt_idx"
  ON "PointRedemption"("userId", "productId", "createdAt" DESC);
