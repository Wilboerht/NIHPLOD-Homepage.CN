-- 简历元数据：原始文件名/大小、职位标题快照、隐私政策同意时间
ALTER TABLE "JobApplication"
  ADD COLUMN "resumeFileName" TEXT,
  ADD COLUMN "resumeSize" INTEGER,
  ADD COLUMN "jobTitleSnapshot" TEXT,
  ADD COLUMN "consentAt" TIMESTAMP(3);

CREATE INDEX "JobApplication_name_idx" ON "JobApplication"("name");
CREATE INDEX "JobApplication_phone_idx" ON "JobApplication"("phone");
