-- 补录申请订单号唯一约束改为按用户隔离。
--
-- 背景：原部分唯一索引 `SpentAdjustmentApplication_active_orderNo_key` 只含 orderNo，
-- 存在两个问题：
--   1. 跨用户枚举 oracle：对任意订单号提交申请，409 即可判断该单号已被他人提交；
--   2. 恶意抢占：攻击者可抢先提交受害者真实订单号，使其无法认领。
--
-- 新索引改为 (userId, orderNo) 部分唯一（WHERE status IN ('PENDING','APPROVED')）：
-- 同一用户仍不可重复提交同一单号，不同用户互不影响（不会因跨用户撞号导致迁移失败）。
DROP INDEX IF EXISTS "SpentAdjustmentApplication_active_orderNo_key";

CREATE UNIQUE INDEX IF NOT EXISTS "SpentAdjustmentApplication_userId_orderNo_active_key"
  ON "SpentAdjustmentApplication"("userId", "orderNo")
  WHERE "status" IN ('PENDING', 'APPROVED');
