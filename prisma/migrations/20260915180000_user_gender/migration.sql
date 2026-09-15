-- 用户性别（会员身份属性，CRM/运营用；经 userinfo profile scope 下发给子项目）
-- 取值：male / female / NULL（未设置=保密）
ALTER TABLE "User" ADD COLUMN "gender" TEXT;
