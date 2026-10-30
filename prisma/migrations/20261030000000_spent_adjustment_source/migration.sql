-- CreateEnum
CREATE TYPE "SpentAdjustmentSource" AS ENUM ('USER', 'ADMIN');

-- AlterTable
ALTER TABLE "SpentAdjustmentApplication" ADD COLUMN     "createdByAdminId" TEXT,
ADD COLUMN     "source" "SpentAdjustmentSource" NOT NULL DEFAULT 'USER';

-- AddForeignKey
ALTER TABLE "SpentAdjustmentApplication" ADD CONSTRAINT "SpentAdjustmentApplication_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
