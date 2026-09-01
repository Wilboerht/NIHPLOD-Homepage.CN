-- ============================================
-- 会员体系简化：两档等级（普通/高级）+ 移除 VIP/SVIP
-- 普通 REGULAR：完成注册
-- 高级 ADVANCED：官方店铺历史购买金额满 ¥1,000
-- ============================================

-- 1. 合并 VIP/SVIP 用户 → 高级会员（历史消费 ≥¥5000/¥20000 必然满足 ¥1000 门槛）
UPDATE "User" SET "membershipLevel" = 'ADVANCED' WHERE "membershipLevel" IN ('VIP', 'SVIP');

-- 2. 清空旧权益配置行（新权益统一由代码默认值提供，
--    管理端按需重新编辑后 upsert 回数据库）
DELETE FROM "MembershipBenefit";

-- 3. 枚举收敛：REGULAR/ADVANCED/VIP/SVIP → REGULAR/ADVANCED
CREATE TYPE "MembershipLevel_new" AS ENUM ('REGULAR', 'ADVANCED');

ALTER TABLE "User" ALTER COLUMN "membershipLevel" DROP DEFAULT;

ALTER TABLE "User"
  ALTER COLUMN "membershipLevel" TYPE "MembershipLevel_new"
  USING ("membershipLevel"::text::"MembershipLevel_new");

ALTER TABLE "User" ALTER COLUMN "membershipLevel" SET DEFAULT 'REGULAR';

ALTER TABLE "MembershipBenefit"
  ALTER COLUMN "level" TYPE "MembershipLevel_new"
  USING ("level"::text::"MembershipLevel_new");

DROP TYPE "MembershipLevel";
ALTER TYPE "MembershipLevel_new" RENAME TO "MembershipLevel";
