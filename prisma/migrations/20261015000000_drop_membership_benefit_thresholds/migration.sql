-- 会员消费门槛单一来源化：判级与前台展示统一由 src/lib/membership.ts LEVEL_THRESHOLDS 提供，
-- MembershipBenefit 表不再承载消费门槛（minSpent/maxSpent 删除）。
-- 注意：本迁移需与新代码同窗口部署（旧代码仍会 SELECT 这两列，窗口内旧实例将报错）。
ALTER TABLE "MembershipBenefit" DROP COLUMN "maxSpent",
DROP COLUMN "minSpent";
