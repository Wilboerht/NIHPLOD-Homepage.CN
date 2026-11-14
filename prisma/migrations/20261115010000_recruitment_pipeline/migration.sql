-- 招聘流程：评级/标签/来源/拒绝原因/最近联系
ALTER TABLE "JobApplication" ADD COLUMN "rating" INTEGER;
ALTER TABLE "JobApplication" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "JobApplication" ADD COLUMN "source" TEXT;
ALTER TABLE "JobApplication" ADD COLUMN "rejectionReason" TEXT;
ALTER TABLE "JobApplication" ADD COLUMN "lastContactedAt" TIMESTAMP(3);

-- 面试安排
CREATE TYPE "JobInterviewMode" AS ENUM ('ONSITE', 'VIDEO', 'PHONE');
CREATE TYPE "JobInterviewResult" AS ENUM ('PENDING', 'PASSED', 'FAILED', 'CANCELLED');

CREATE TABLE "JobInterview" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "mode" "JobInterviewMode" NOT NULL DEFAULT 'VIDEO',
    "locationOrLink" TEXT,
    "interviewer" TEXT,
    "note" TEXT,
    "result" "JobInterviewResult" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobInterview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JobInterview_applicationId_scheduledAt_idx" ON "JobInterview"("applicationId", "scheduledAt");
CREATE INDEX "JobInterview_scheduledAt_idx" ON "JobInterview"("scheduledAt");

ALTER TABLE "JobInterview" ADD CONSTRAINT "JobInterview_applicationId_fkey"
FOREIGN KEY ("applicationId") REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 候选人时间线
CREATE TABLE "JobApplicationEvent" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "note" TEXT,
    "metadata" JSONB,
    "changedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobApplicationEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JobApplicationEvent_applicationId_createdAt_idx" ON "JobApplicationEvent"("applicationId", "createdAt");
CREATE INDEX "JobApplicationEvent_changedByAdminId_idx" ON "JobApplicationEvent"("changedByAdminId");

ALTER TABLE "JobApplicationEvent" ADD CONSTRAINT "JobApplicationEvent_applicationId_fkey"
FOREIGN KEY ("applicationId") REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobApplicationEvent" ADD CONSTRAINT "JobApplicationEvent_changedByAdminId_fkey"
FOREIGN KEY ("changedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
