-- 积分流水新增 ADJUST 类型：管理端人工调整（补偿/冲正），
-- 正向计 remaining 且 6 个月过期（参与 FIFO 兑礼消耗与过期清理），负向直接冲可用余额。
ALTER TYPE "PointLedgerType" ADD VALUE 'ADJUST';
