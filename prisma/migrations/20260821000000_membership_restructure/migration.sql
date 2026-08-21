-- ============================================
-- 会员体系重构：五档等级（消费金额驱动）+ 积分规则升级
-- ============================================

-- 1. User 增加历史购买金额字段
ALTER TABLE "User" ADD COLUMN "totalSpent" INTEGER NOT NULL DEFAULT 0;

-- 2. MembershipBenefit 字段改名（积分口径 → 消费口径），删除 pointRate
ALTER TABLE "MembershipBenefit" RENAME COLUMN "minPoints" TO "minSpent";
ALTER TABLE "MembershipBenefit" RENAME COLUMN "maxPoints" TO "maxSpent";
ALTER TABLE "MembershipBenefit" DROP COLUMN "pointRate";

-- 3. 枚举转换：SILVER/GOLD/DIAMOND → REGULAR/ADVANCED/VIP/SVIP
--    临时映射：SILVER→REGULAR、GOLD→VIP、DIAMOND→SVIP（随后按 totalSpent 重算）
CREATE TYPE "MembershipLevel_new" AS ENUM ('REGULAR', 'ADVANCED', 'VIP', 'SVIP');

ALTER TABLE "User" ALTER COLUMN "membershipLevel" DROP DEFAULT;

ALTER TABLE "User"
  ALTER COLUMN "membershipLevel" TYPE "MembershipLevel_new"
  USING CASE "membershipLevel"
    WHEN 'SILVER'   THEN 'REGULAR'::"MembershipLevel_new"
    WHEN 'GOLD'     THEN 'VIP'::"MembershipLevel_new"
    WHEN 'DIAMOND'  THEN 'SVIP'::"MembershipLevel_new"
  END;

ALTER TABLE "User" ALTER COLUMN "membershipLevel" SET DEFAULT 'REGULAR';

ALTER TABLE "MembershipBenefit"
  ALTER COLUMN "level" TYPE "MembershipLevel_new"
  USING CASE "level"
    WHEN 'SILVER'   THEN 'REGULAR'::"MembershipLevel_new"
    WHEN 'GOLD'     THEN 'VIP'::"MembershipLevel_new"
    WHEN 'DIAMOND'  THEN 'SVIP'::"MembershipLevel_new"
  END;

DROP TYPE "MembershipLevel";
ALTER TYPE "MembershipLevel_new" RENAME TO "MembershipLevel";

-- 4. 积分倍数活动表
CREATE TABLE "PointCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "multiplier" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PointCampaign_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PointCampaign_startAt_endAt_idx" ON "PointCampaign"("startAt", "endAt");

-- 5. 回填 totalSpent：已支付订单实付总额 − 退款成功总额（不下穿 0）
UPDATE "User" u
SET "totalSpent" = GREATEST(0, COALESCE(p.paid, 0) - COALESCE(r.refunded, 0))
FROM (
    SELECT "userId", SUM("payAmount")::INTEGER AS paid
    FROM "Order"
    WHERE "paymentTime" IS NOT NULL
      AND "status" NOT IN ('PENDING', 'PAYING', 'CANCELLED')
    GROUP BY "userId"
) p
LEFT JOIN (
    SELECT "userId", SUM("refundAmount")::INTEGER AS refunded
    FROM "Order"
    WHERE "refundStatus" = 'SUCCESS' AND "refundAmount" IS NOT NULL
    GROUP BY "userId"
) r ON r."userId" = p."userId"
WHERE u."id" = p."userId";

-- 6. 按 totalSpent 重算会员等级
UPDATE "User"
SET "membershipLevel" = CASE
    WHEN "totalSpent" >= 20000 THEN 'SVIP'::"MembershipLevel"
    WHEN "totalSpent" >= 5000  THEN 'VIP'::"MembershipLevel"
    WHEN "totalSpent" > 0      THEN 'ADVANCED'::"MembershipLevel"
    ELSE 'REGULAR'::"MembershipLevel"
END;

-- 7. 修正既有权益配置行的消费门槛
UPDATE "MembershipBenefit" SET "minSpent" = 0, "maxSpent" = 0 WHERE "level" = 'REGULAR';
UPDATE "MembershipBenefit" SET "minSpent" = 5000, "maxSpent" = 19999 WHERE "level" = 'VIP';
UPDATE "MembershipBenefit" SET "minSpent" = 20000, "maxSpent" = NULL WHERE "level" = 'SVIP';

-- 8. 补种 ADVANCED 等级权益配置（若不存在）
INSERT INTO "MembershipBenefit" ("id", "level", "name", "minSpent", "maxSpent", "benefits", "createdAt", "updatedAt")
SELECT 'mb-advanced', 'ADVANCED', '高级会员', 1, 4999,
  '[{"icon":"🎁","title":"积分累积","desc":"消费10元=1积分"},{"icon":"🎫","title":"专属优惠券","desc":"每月可领取专属优惠券"},{"icon":"📦","title":"包邮权益","desc":"订单满99元包邮"}]'::jsonb,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "MembershipBenefit" WHERE "level" = 'ADVANCED');
