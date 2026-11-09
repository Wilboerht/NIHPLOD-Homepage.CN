-- 兑换售后字段与时间线
ALTER TABLE "PointRedemption"
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "afterSalesRequestedAt" TIMESTAMP(3),
  ADD COLUMN "afterSalesReason" TEXT,
  ADD COLUMN "afterSalesImages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "afterSalesReviewedAt" TIMESTAMP(3),
  ADD COLUMN "afterSalesReviewedById" TEXT,
  ADD COLUMN "afterSalesReviewNote" TEXT,
  ADD COLUMN "afterSalesApprovedAt" TIMESTAMP(3),
  ADD COLUMN "afterSalesClosedAt" TIMESTAMP(3),
  ADD COLUMN "returnWaybillNo" TEXT,
  ADD COLUMN "returnCarrier" TEXT,
  ADD COLUMN "returnShippedAt" TIMESTAMP(3),
  ADD COLUMN "returnReceivedAt" TIMESTAMP(3),
  ADD COLUMN "inspectionNote" TEXT,
  ADD COLUMN "restockApproved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "stockRestored" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "stockRestoredAt" TIMESTAMP(3),
  ADD COLUMN "refundedPoints" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "refundedAt" TIMESTAMP(3);

CREATE TABLE "PointRedemptionEvent" (
    "id" TEXT NOT NULL,
    "redemptionId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "reasonCode" TEXT,
    "reasonText" TEXT,
    "metadata" JSONB,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointRedemptionEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PointRedemptionEvent_redemptionId_idempotencyKey_key"
  ON "PointRedemptionEvent"("redemptionId", "idempotencyKey");
CREATE INDEX "PointRedemptionEvent_redemptionId_createdAt_idx"
  ON "PointRedemptionEvent"("redemptionId", "createdAt");
CREATE INDEX "PointRedemptionEvent_toStatus_createdAt_idx"
  ON "PointRedemptionEvent"("toStatus", "createdAt");

ALTER TABLE "PointRedemptionEvent"
  ADD CONSTRAINT "PointRedemptionEvent_redemptionId_fkey"
  FOREIGN KEY ("redemptionId") REFERENCES "PointRedemption"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
