ALTER TABLE "SpentAdjustmentApplication" ADD COLUMN "lastReviewAmount" INTEGER;
ALTER TABLE "SpentAdjustmentApplication" ADD COLUMN "lastReviewNote" TEXT;
ALTER TABLE "SpentAdjustmentApplication" ADD COLUMN "lastReviewedById" TEXT;
ALTER TABLE "SpentAdjustmentApplication" ADD COLUMN "lastReviewedAt" TIMESTAMP(3);
ALTER TABLE "SpentAdjustmentApplication" ADD COLUMN "undoReason" TEXT;
ALTER TABLE "SpentAdjustmentApplication" ADD COLUMN "undoneById" TEXT;
ALTER TABLE "SpentAdjustmentApplication" ADD COLUMN "undoneAt" TIMESTAMP(3);
