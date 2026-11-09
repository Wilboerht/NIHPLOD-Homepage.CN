ALTER TABLE "OAuthClient"
  ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false;

UPDATE "OAuthClient"
SET "isSystem" = true
WHERE "clientId" = 'agent-auth';

CREATE INDEX "OAuthClient_isSystem_idx"
  ON "OAuthClient"("isSystem");
