ALTER TABLE "JobApplication"
  DROP CONSTRAINT IF EXISTS "JobApplication_jobId_fkey";

ALTER TABLE "JobApplication"
  ADD CONSTRAINT "JobApplication_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "Job"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
