-- 新兑换单记录实际库存扣减；历史单保守视为未扣减，避免取消时凭空增加库存。
ALTER TABLE "PointRedemption"
  ADD COLUMN "stockDeducted" BOOLEAN NOT NULL DEFAULT false;

-- RefreshToken 与 OAuthSession.sessionId 的显式关联；历史 token 保持 NULL 并走兼容路径。
ALTER TABLE "RefreshToken"
  ADD COLUMN "oauthSessionId" TEXT;

CREATE INDEX IF NOT EXISTS "RefreshToken_oauthSessionId_idx"
  ON "RefreshToken" ("oauthSessionId");
