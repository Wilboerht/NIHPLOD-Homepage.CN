ALTER TABLE "SpentOrderClaim"
  ADD COLUMN "originalAmount" INTEGER,
  ADD COLUMN "refundedAmount" INTEGER NOT NULL DEFAULT 0;
