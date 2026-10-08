-- CreateTable
CREATE TABLE "CaptchaChallenge" (
    "id" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaptchaChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaptchaChallenge_expiresAt_idx" ON "CaptchaChallenge"("expiresAt");
