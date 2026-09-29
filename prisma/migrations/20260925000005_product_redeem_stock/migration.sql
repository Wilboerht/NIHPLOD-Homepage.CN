-- 积分兑换库存：Product.redeemStock（null = 不限量，向后兼容存量数据）。
-- 兑换时以「redeemStock >= 1」条件扣减（CAS），命中 0 行即库存不足，并发不超卖。
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "redeemStock" INTEGER;
