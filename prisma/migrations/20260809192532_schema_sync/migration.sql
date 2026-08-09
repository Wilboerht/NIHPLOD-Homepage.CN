-- =====================================================
-- Schema Sync Migration
-- =====================================================
-- Changes:
--   1. TokenBlacklistType: add missing enum values (logout_jti, wechat_exchange_token, internal_api_nonce)
--   2. Address: add postalCode column
--   3. ContactMessage: add reply and repliedAt columns
-- =====================================================

-- 1a. Add logout_jti to TokenBlacklistType (safe if already exists)
DO $$ BEGIN
  ALTER TYPE "TokenBlacklistType" ADD VALUE 'logout_jti';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 1b. Add wechat_exchange_token (may already exist from failed migration)
DO $$ BEGIN
  ALTER TYPE "TokenBlacklistType" ADD VALUE 'wechat_exchange_token';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 1c. Add internal_api_nonce (may already exist from failed migration)
DO $$ BEGIN
  ALTER TYPE "TokenBlacklistType" ADD VALUE 'internal_api_nonce';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Address: add postalCode column
ALTER TABLE "Address" ADD COLUMN IF NOT EXISTS "postalCode" TEXT;

-- 3. ContactMessage: add reply and repliedAt columns
ALTER TABLE "ContactMessage" ADD COLUMN IF NOT EXISTS "reply" TEXT;
ALTER TABLE "ContactMessage" ADD COLUMN IF NOT EXISTS "repliedAt" TIMESTAMP(3);
