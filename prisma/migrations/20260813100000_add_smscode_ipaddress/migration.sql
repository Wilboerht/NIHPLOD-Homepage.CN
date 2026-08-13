-- 补齐 SmsCode.ipAddress 列
-- 背景：schema.prisma 中 SmsCode.ipAddress 是历史 db push 时期加入的字段，
-- 未生成对应迁移，导致按 migrations 建库的生产环境缺列，
-- /api/auth/send-code 报 "The column SmsCode.ipAddress does not exist" 500。
-- IF NOT EXISTS 保证在已通过 db push 补过的环境（如本地开发库）上重放安全。
ALTER TABLE "SmsCode" ADD COLUMN IF NOT EXISTS "ipAddress" TEXT;
