-- CreateTable
CREATE TABLE "AdvisorSession" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "fingerprint" TEXT,
    "userAgent" TEXT,
    "ip" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "questionnaireStartedAt" TIMESTAMP(3),
    "questionnaireCompletedAt" TIMESTAMP(3),
    "answers" JSONB,
    "faceScanStartedAt" TIMESTAMP(3),
    "faceScanCompletedAt" TIMESTAMP(3),
    "faceScanSkipped" BOOLEAN NOT NULL DEFAULT false,
    "faceScanUsed" BOOLEAN NOT NULL DEFAULT false,
    "analysisStartedAt" TIMESTAMP(3),
    "analysisCompletedAt" TIMESTAMP(3),
    "analysisSource" TEXT,
    "resultViewedAt" TIMESTAMP(3),
    "resultShared" BOOLEAN NOT NULL DEFAULT false,
    "shareMethod" TEXT,
    "referrer" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "deviceType" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdvisorSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvisorDailyStats" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "totalSessions" INTEGER NOT NULL DEFAULT 0,
    "uniqueVisitors" INTEGER NOT NULL DEFAULT 0,
    "startedQuestionnaire" INTEGER NOT NULL DEFAULT 0,
    "completedQuestionnaire" INTEGER NOT NULL DEFAULT 0,
    "startedFaceScan" INTEGER NOT NULL DEFAULT 0,
    "completedFaceScan" INTEGER NOT NULL DEFAULT 0,
    "skippedFaceScan" INTEGER NOT NULL DEFAULT 0,
    "completedAnalysis" INTEGER NOT NULL DEFAULT 0,
    "viewedResult" INTEGER NOT NULL DEFAULT 0,
    "sharedResult" INTEGER NOT NULL DEFAULT 0,
    "aiAnalysisCount" INTEGER NOT NULL DEFAULT 0,
    "fallbackAnalysisCount" INTEGER NOT NULL DEFAULT 0,
    "answerDistribution" JSONB,
    "deviceDistribution" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdvisorDailyStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdvisorSession_sessionId_key" ON "AdvisorSession"("sessionId");

-- CreateIndex
CREATE INDEX "AdvisorSession_createdAt_idx" ON "AdvisorSession"("createdAt");

-- CreateIndex
CREATE INDEX "AdvisorSession_faceScanSkipped_idx" ON "AdvisorSession"("faceScanSkipped");

-- CreateIndex
CREATE INDEX "AdvisorSession_analysisSource_idx" ON "AdvisorSession"("analysisSource");

-- CreateIndex
CREATE UNIQUE INDEX "AdvisorDailyStats_date_key" ON "AdvisorDailyStats"("date");

-- CreateIndex
CREATE INDEX "AdvisorDailyStats_date_idx" ON "AdvisorDailyStats"("date");
