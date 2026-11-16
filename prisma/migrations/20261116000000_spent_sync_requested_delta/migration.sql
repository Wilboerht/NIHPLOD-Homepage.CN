-- 记录消费同步的原始请求值（钳制前），用于幂等比较。
-- spentDelta 仍保存实际生效值（可能被 0 下限钳制），对账口径不变。
ALTER TABLE "SpentSyncRecord" ADD COLUMN "requestedDelta" INTEGER;

-- 历史记录没有钳制信息，回退为实际生效值。
UPDATE "SpentSyncRecord" SET "requestedDelta" = "spentDelta" WHERE "requestedDelta" IS NULL;
