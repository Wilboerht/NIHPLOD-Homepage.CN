-- CreateTable
CREATE TABLE "PaymentNotification" (
    "id" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rawData" TEXT NOT NULL,
    "errorMessage" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentNotification_gateway_notificationId_key" ON "PaymentNotification"("gateway", "notificationId");

-- CreateIndex
CREATE INDEX "PaymentNotification_gateway_status_idx" ON "PaymentNotification"("gateway", "status");

-- CreateIndex
CREATE INDEX "PaymentNotification_transactionId_idx" ON "PaymentNotification"("transactionId");

-- CreateIndex
CREATE INDEX "PaymentNotification_createdAt_idx" ON "PaymentNotification"("createdAt");
