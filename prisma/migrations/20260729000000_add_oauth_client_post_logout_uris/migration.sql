-- AlterTable
ALTER TABLE "OAuthClient" ADD COLUMN IF NOT EXISTS "postLogoutRedirectUris" TEXT[] DEFAULT '{}';
