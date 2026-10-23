-- 商城兑换撤销退分：独立流水类型，便于对账与用户账单展示
ALTER TYPE "PointLedgerType" ADD VALUE IF NOT EXISTS 'REDEEM_REFUND';
