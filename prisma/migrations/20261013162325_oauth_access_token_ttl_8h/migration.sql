ALTER TABLE "OAuthClient" ALTER COLUMN "accessTokenTtlSeconds" SET DEFAULT 28800;
UPDATE "OAuthClient" SET "accessTokenTtlSeconds" = 28800 WHERE "accessTokenTtlSeconds" = 900;
