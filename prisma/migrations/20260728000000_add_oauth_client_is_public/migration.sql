-- Add isPublic flag to OAuthClient to support Public Client (SPA/mobile/desktop) vs Confidential Client (server-side)

-- AlterTable
ALTER TABLE "OAuthClient" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;
