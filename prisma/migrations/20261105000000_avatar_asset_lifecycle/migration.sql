CREATE TABLE "AvatarAsset" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "derivedUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "attachedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AvatarAsset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AvatarAsset_objectKey_key" UNIQUE ("objectKey"),
  CONSTRAINT "AvatarAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AvatarAsset_userId_idx" ON "AvatarAsset"("userId");
CREATE INDEX "AvatarAsset_pending_cleanup_idx" ON "AvatarAsset"("attachedAt", "createdAt");
