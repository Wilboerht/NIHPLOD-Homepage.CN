-- 统一消费订单来源与跨来源占用
CREATE TYPE "SpentOrderSource" AS ENUM ('MALL_SYNC', 'SPENT_IMPORT', 'SPENT_ADJUSTMENT');

ALTER TABLE "SpentSyncRecord"
  ADD COLUMN "orderNo" TEXT,
  ADD COLUMN "orderNoKey" TEXT,
  ADD COLUMN "source" "SpentOrderSource";

CREATE TABLE "SpentOrderClaim" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "orderNo" TEXT NOT NULL,
  "orderNoKey" TEXT NOT NULL,
  "source" "SpentOrderSource" NOT NULL,
  "reference" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SpentOrderClaim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SpentOrderClaim_userId_orderNoKey_key"
  ON "SpentOrderClaim"("userId", "orderNoKey");
CREATE INDEX "SpentOrderClaim_reference_idx"
  ON "SpentOrderClaim"("reference");
CREATE INDEX "SpentOrderClaim_source_createdAt_idx"
  ON "SpentOrderClaim"("source", "createdAt" DESC);
CREATE INDEX "SpentSyncRecord_userId_orderNoKey_idx"
  ON "SpentSyncRecord"("userId", "orderNoKey");
CREATE INDEX "SpentSyncRecord_orderNoKey_idx"
  ON "SpentSyncRecord"("orderNoKey");

ALTER TABLE "SpentOrderClaim"
  ADD CONSTRAINT "SpentOrderClaim_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
