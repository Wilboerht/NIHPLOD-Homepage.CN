-- SmsCode 表增加 attempts 列：验证码校验失败计数
-- 应用层（src/lib/sms.ts 的 recordSmsCodeFailure）在每次校验失败时原子递增 attempts，
-- 达到上限（SMS_CODE_MAX_ATTEMPTS = 5）后将 used 置为 true 作废该验证码，防止单码爆破。
-- IF NOT EXISTS 保证在已补过列的环境上重放安全。
ALTER TABLE "SmsCode" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;
