-- ============================================
-- 会员体系四档：普通 / 银卡(¥1,000) / 金卡(¥5,000) / 钻石(¥10,000)
-- + 积分体系重新上线（消费 1 元 = 1 分，银卡及以上，稳定期 7 天，6 个月过期）
-- + 生日锁定（首次设置后锁定，修改需人工客服）+ 各档激活日字段
-- ============================================

-- 1. 枚举切换：REGULAR/ADVANCED → REGULAR/SILVER/GOLD/DIAMOND
--    先把 ADVANCED 归一为 REGULAR（两者在旧枚举中都合法），切换列类型后再按累计消费拆档。
UPDATE "User" SET "membershipLevel" = 'REGULAR' WHERE "membershipLevel" = 'ADVANCED';

CREATE TYPE "MembershipLevel_new" AS ENUM ('REGULAR', 'SILVER', 'GOLD', 'DIAMOND');

ALTER TABLE "User" ALTER COLUMN "membershipLevel" DROP DEFAULT;

ALTER TABLE "User"
  ALTER COLUMN "membershipLevel" TYPE "MembershipLevel_new"
  USING ("membershipLevel"::text::"MembershipLevel_new");

ALTER TABLE "User" ALTER COLUMN "membershipLevel" SET DEFAULT 'REGULAR';

-- 2. 按累计消费拆档（历史 ADVANCED <¥1,000 的遗留用户归普通；区间互斥避免相互覆盖）
UPDATE "User" SET "membershipLevel" = 'DIAMOND' WHERE "totalSpent" >= 10000;
UPDATE "User" SET "membershipLevel" = 'GOLD'    WHERE "totalSpent" >= 5000 AND "totalSpent" < 10000;
UPDATE "User" SET "membershipLevel" = 'SILVER'  WHERE "totalSpent" >= 1000 AND "totalSpent" < 5000;

-- 3. 清空旧权益配置行（新权益统一由代码默认值提供，管理端按需重新编辑后 upsert 回数据库）
DELETE FROM "MembershipBenefit";

ALTER TABLE "MembershipBenefit"
  ALTER COLUMN "level" TYPE "MembershipLevel_new"
  USING ("level"::text::"MembershipLevel_new");

DROP TYPE "MembershipLevel";
ALTER TYPE "MembershipLevel_new" RENAME TO "MembershipLevel";

-- 4. User 新增字段：各档激活日（仅成长展示，无有效期）+ 生日锁定 + 生日积分年度幂等
ALTER TABLE "User" ADD COLUMN "silverActivatedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "goldActivatedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "diamondActivatedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "birthdayLocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "lastBirthdayRewardYear" INTEGER;

-- 5. 积分体系枚举与表
CREATE TYPE "PointLedgerType" AS ENUM ('CONSUME', 'REFUND', 'BIRTHDAY', 'REDEEM', 'EXPIRE');

-- 积分流水（FIFO 消耗：发放类流水记录 remaining，兑礼/过期按时间序消耗）
CREATE TABLE "PointLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "PointLedgerType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "remaining" INTEGER,
    "reference" TEXT NOT NULL,
    "note" TEXT,
    "frozenUntil" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointLedger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PointLedger_userId_reference_key"
    ON "PointLedger"("userId", "reference");

CREATE INDEX "PointLedger_userId_createdAt_idx"
    ON "PointLedger"("userId", "createdAt" DESC);

CREATE INDEX "PointLedger_userId_type_expiresAt_idx"
    ON "PointLedger"("userId", "type", "expiresAt");

ALTER TABLE "PointLedger" ADD CONSTRAINT "PointLedger_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 积分余额（可用可负；冻结部分稳定期后释放）
CREATE TABLE "PointBalance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "available" INTEGER NOT NULL DEFAULT 0,
    "frozen" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PointBalance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PointBalance_userId_key" ON "PointBalance"("userId");

ALTER TABLE "PointBalance" ADD CONSTRAINT "PointBalance_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
