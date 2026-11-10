CREATE TYPE "PointLedgerSource" AS ENUM ('WEBSITE', 'MALL', 'UNKNOWN');
ALTER TABLE "PointLedger" ADD COLUMN "source" "PointLedgerSource" NOT NULL DEFAULT 'UNKNOWN';
