-- OAuth Client scope 缩权版本与会话失效水位
ALTER TABLE "OAuthClient" ADD COLUMN "scopeVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OAuthClient" ADD COLUMN "sessionsInvalidatedAt" TIMESTAMP(3);
