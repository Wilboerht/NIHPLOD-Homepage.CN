-- 会员权益/文案改为代码配置（src/lib/membership.ts），移除运行时 DB 覆盖表。
-- 该表只存展示文案覆盖，不承载判级或积分规则；删除前如仍有运营覆盖数据，
-- 需确认已迁移到代码默认值或接受展示文案回退。
DROP TABLE IF EXISTS "MembershipBenefit";
