-- ============================================
-- 会员等级变更轨迹（二期：完整升/降档记录）
-- 消费额同步入账时等级发生变化则写入；幂等键与 SpentSyncRecord.reference 一致
-- ============================================

CREATE TABLE "MembershipLevelChange" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromLevel" "MembershipLevel" NOT NULL,
    "toLevel" "MembershipLevel" NOT NULL,
    "reference" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipLevelChange_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MembershipLevelChange_userId_reference_key"
    ON "MembershipLevelChange"("userId", "reference");

CREATE INDEX "MembershipLevelChange_userId_createdAt_idx"
    ON "MembershipLevelChange"("userId", "createdAt" DESC);

ALTER TABLE "MembershipLevelChange" ADD CONSTRAINT "MembershipLevelChange_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
