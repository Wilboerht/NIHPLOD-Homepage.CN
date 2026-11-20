-- 企业微信 KF 外部身份 → 主站用户映射
CREATE TABLE "KfIdentityLink" (
    "id" TEXT NOT NULL,
    "openKfid" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'advisor_report',
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KfIdentityLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KfIdentityLink_openKfid_externalUserId_key"
    ON "KfIdentityLink"("openKfid", "externalUserId");

CREATE INDEX "KfIdentityLink_userId_idx"
    ON "KfIdentityLink"("userId");

CREATE INDEX "KfIdentityLink_linkedAt_idx"
    ON "KfIdentityLink"("linkedAt");

ALTER TABLE "KfIdentityLink"
    ADD CONSTRAINT "KfIdentityLink_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
