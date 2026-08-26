-- ============================================
-- 删除"官网直接购买"能力（订单/支付/购物车/优惠券/收货地址）
-- 保留：第三方平台导流展示（Product + PurchaseLink）、用户中心、SSO、积分/会员体系
-- 所有 DROP 均带 IF EXISTS，保证可重放
-- ============================================

-- 1. UserCoupon（依赖 Coupon / User / Order，先删）
DROP TABLE IF EXISTS "UserCoupon";

-- 2. Transaction（依赖 Order）
DROP TABLE IF EXISTS "Transaction";

-- 3. OrderItem（依赖 Order / Product）
DROP TABLE IF EXISTS "OrderItem";

-- 4. Order（依赖 User）
DROP TABLE IF EXISTS "Order";

-- 5. CartItem / Address / PaymentNotification / PointCampaign
DROP TABLE IF EXISTS "CartItem";
DROP TABLE IF EXISTS "Address";
DROP TABLE IF EXISTS "PaymentNotification";
DROP TABLE IF EXISTS "PointCampaign";

-- 6. Coupon
DROP TABLE IF EXISTS "Coupon";

-- 7. Setting（此前仅用于运费策略 shipping_config，随直接购买能力一并删除）
DROP TABLE IF EXISTS "Setting";

-- 8. Product 删除站内购买相关字段（保留展示与第三方导流字段）
ALTER TABLE "Product" DROP COLUMN IF EXISTS "purchaseUrl";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "allowDirectBuy";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "stock";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "salesCount";

-- 9. 删除电商相关枚举
DROP TYPE IF EXISTS "OrderStatus";
DROP TYPE IF EXISTS "RefundStatus";
DROP TYPE IF EXISTS "UserCouponStatus";
