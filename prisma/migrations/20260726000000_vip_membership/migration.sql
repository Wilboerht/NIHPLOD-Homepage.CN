-- CreateEnum
CREATE TYPE "MembershipLevel" AS ENUM ('SILVER', 'GOLD', 'DIAMOND');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "membershipLevel" "MembershipLevel" NOT NULL DEFAULT 'SILVER',
ADD COLUMN "totalPoints" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "birthday" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "User_membershipLevel_idx" ON "User"("membershipLevel");

-- CreateTable
CREATE TABLE "PointTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PointTransaction_userId_createdAt_idx" ON "PointTransaction"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PointTransaction_type_createdAt_idx" ON "PointTransaction"("type", "createdAt" DESC);

-- CreateTable
CREATE TABLE "MembershipBenefit" (
    "id" TEXT NOT NULL,
    "level" "MembershipLevel" NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "icon" TEXT,
    "minPoints" INTEGER NOT NULL,
    "maxPoints" INTEGER,
    "pointRate" INTEGER NOT NULL DEFAULT 1,
    "benefits" JSONB NOT NULL,
    "colorClass" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipBenefit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MembershipBenefit_level_key" ON "MembershipBenefit"("level");

-- AddForeignKey
ALTER TABLE "PointTransaction" ADD CONSTRAINT "PointTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
