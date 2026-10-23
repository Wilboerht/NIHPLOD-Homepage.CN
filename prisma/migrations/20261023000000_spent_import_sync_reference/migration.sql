-- 消费 Excel 导入：新增跨批次稳定幂等键
-- reference 保留为批内行键（含随机 version），syncReference 仅由内容生成，
-- 用于跨文件/跨批次预检“已成功且未撤销”的相同内容，避免修改一行后重传导致重复入账；
-- 撤销后 revertedAt 非空，同一内容可重新导入（新的批内 reference）。
ALTER TABLE "SpentImportRow" ADD COLUMN "syncReference" TEXT;

-- 历史行回填：旧 reference 形如 import:<内容哈希>:<随机version>
UPDATE "SpentImportRow"
SET "syncReference" = substring("reference" from '^(import:[0-9a-f]{32})')
WHERE "syncReference" IS NULL
  AND "reference" ~ '^import:[0-9a-f]{32}:';

CREATE INDEX "SpentImportRow_userId_syncReference_status_idx"
  ON "SpentImportRow"("userId", "syncReference", "status");
