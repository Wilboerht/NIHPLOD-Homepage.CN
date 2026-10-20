-- AlterTable
ALTER TABLE "Admin" ADD COLUMN "totpResetRequired" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AdminTotpRecovery" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminTotpRecovery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminTotpRecovery_tokenHash_key" ON "AdminTotpRecovery"("tokenHash");

-- CreateIndex
CREATE INDEX "AdminTotpRecovery_adminId_expiresAt_idx" ON "AdminTotpRecovery"("adminId", "expiresAt");

-- CreateIndex
CREATE INDEX "AdminTotpRecovery_usedAt_idx" ON "AdminTotpRecovery"("usedAt");

-- CreateIndex
CREATE INDEX "AdminTotpRecovery_expiresAt_idx" ON "AdminTotpRecovery"("expiresAt");

-- AddForeignKey
ALTER TABLE "AdminTotpRecovery" ADD CONSTRAINT "AdminTotpRecovery_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminTotpRecovery" ADD CONSTRAINT "AdminTotpRecovery_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
