ALTER TABLE "ContactMessage"
  RENAME COLUMN "reply" TO "internalNote";

ALTER TABLE "ContactMessage"
  RENAME COLUMN "repliedAt" TO "notedAt";
