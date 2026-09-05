-- ============================================
-- 物流可见 P1：兑换记录增加承运商与运单号
-- 管理端履约时录入运单号，用户端据此查询顺丰轨迹
-- ============================================

ALTER TABLE "PointRedemption" ADD COLUMN "carrier" TEXT;
ALTER TABLE "PointRedemption" ADD COLUMN "waybillNo" TEXT;

CREATE INDEX "PointRedemption_waybillNo_idx" ON "PointRedemption"("waybillNo");
