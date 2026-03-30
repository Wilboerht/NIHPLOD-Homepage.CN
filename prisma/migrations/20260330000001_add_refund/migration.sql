-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'CLOSED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "refundNo" TEXT,
ADD COLUMN "refundAmount" DECIMAL(10,2),
ADD COLUMN "refundTime" TIMESTAMP(3),
ADD COLUMN "refundStatus" "RefundStatus";
