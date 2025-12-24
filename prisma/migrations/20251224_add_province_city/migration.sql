-- Add province and city fields to AdvisorSession for geographic analytics
-- This migration adds location tracking fields that may be missing in production

-- Add province column if it doesn't exist
ALTER TABLE "AdvisorSession" ADD COLUMN IF NOT EXISTS "province" TEXT;

-- Add city column if it doesn't exist  
ALTER TABLE "AdvisorSession" ADD COLUMN IF NOT EXISTS "city" TEXT;

-- Add index on province for faster geographic queries
CREATE INDEX IF NOT EXISTS "AdvisorSession_province_idx" ON "AdvisorSession"("province");

