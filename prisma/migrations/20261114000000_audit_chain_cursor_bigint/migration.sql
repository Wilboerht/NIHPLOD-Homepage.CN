CREATE TABLE IF NOT EXISTS "AuditChainCursor" (
  "stream" TEXT NOT NULL,
  "seq" BIGINT NOT NULL DEFAULT 0,
  "lastHash" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditChainCursor_pkey" PRIMARY KEY ("stream")
);

ALTER TABLE "AuditLog" ALTER COLUMN "chainSeq" TYPE BIGINT;

INSERT INTO "AuditChainCursor" ("stream", "seq", "lastHash", "updatedAt")
SELECT
  'audit',
  COALESCE((SELECT MAX("chainSeq") FROM "AuditLog"), 0),
  (
    SELECT "entryHash"
    FROM "AuditLog"
    WHERE "chainSeq" IS NOT NULL
    ORDER BY "chainSeq" DESC
    LIMIT 1
  ),
  CURRENT_TIMESTAMP
ON CONFLICT ("stream") DO NOTHING;
