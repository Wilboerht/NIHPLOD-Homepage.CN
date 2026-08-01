-- =====================================================
-- Security & UI Improvements Migration
-- =====================================================
-- Changes:
--   1. OAuthAuthorizationCode: add nonce column, FK relations
--   2. OAuthSession: add FK relations
--   3. UserConsent: add FK relations
--   4. RateLimitRecord: add unique constraint
--   5. PaymentNotification: amount Int → Decimal(10,2)
--   6. User: add wechatUnionId index
--   7. Cleanup: remove duplicate indexes (@unique already covers them)
-- =====================================================

-- 1. OAuthAuthorizationCode: add nonce column
ALTER TABLE "OAuthAuthorizationCode" ADD COLUMN "nonce" TEXT;

-- 2. OAuthAuthorizationCode: add FK relations
--   (orphan clientId/userId would fail FK creation — if any exist, clean them first)
ALTER TABLE "OAuthAuthorizationCode" 
  ADD CONSTRAINT "OAuthAuthorizationCode_clientId_fkey" 
  FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("clientId") ON DELETE CASCADE;
ALTER TABLE "OAuthAuthorizationCode" 
  ADD CONSTRAINT "OAuthAuthorizationCode_userId_fkey" 
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;

-- 3. OAuthSession: add FK relations
ALTER TABLE "OAuthSession" 
  ADD CONSTRAINT "OAuthSession_clientId_fkey" 
  FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("clientId") ON DELETE CASCADE;
ALTER TABLE "OAuthSession" 
  ADD CONSTRAINT "OAuthSession_userId_fkey" 
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;

-- 4. UserConsent: add FK relations
ALTER TABLE "UserConsent" 
  ADD CONSTRAINT "UserConsent_clientId_fkey" 
  FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("clientId") ON DELETE CASCADE;
ALTER TABLE "UserConsent" 
  ADD CONSTRAINT "UserConsent_userId_fkey" 
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;

-- 5. RateLimitRecord: add unique constraint
ALTER TABLE "RateLimitRecord" 
  ADD CONSTRAINT "RateLimitRecord_key_windowStart_key" 
  UNIQUE ("key", "windowStart");

-- 6. PaymentNotification: amount Int → Decimal(10,2)
ALTER TABLE "PaymentNotification" 
  ALTER COLUMN "amount" TYPE DECIMAL(10,2);

-- 7. User: add wechatUnionId index (for WeChat identity lookups)
CREATE INDEX "User_wechatUnionId_idx" ON "User"("wechatUnionId");

-- 8. Remove duplicate indexes (@unique / FK already covers them)
DROP INDEX IF EXISTS "OAuthAuthorizationCode_code_key";
DROP INDEX IF EXISTS "OAuthSession_sessionId_key";
DROP INDEX IF EXISTS "UserCoupon_orderId_key";
DROP INDEX IF EXISTS "RateLimitRecord_key_windowStart_idx";
