-- 消费导入加固：
-- 1) 批次记录导入原因/工单号，便于财务审计
-- 2) 行增加规范化订单号去重键；历史行保持 NULL，不参与唯一约束
-- 3) 成功且未撤销的新订单号在数据库层唯一，防止并发跨文件重复入账
ALTER TABLE "SpentImportBatch" ADD COLUMN "reason" TEXT;
ALTER TABLE "SpentImportRow" ADD COLUMN "orderNoKey" TEXT;

CREATE INDEX IF NOT EXISTS "SpentImportRow_userId_orderNoKey_idx"
  ON "SpentImportRow"("userId", "orderNoKey");

CREATE UNIQUE INDEX IF NOT EXISTS "SpentImportRow_userId_orderNoKey_success_key"
  ON "SpentImportRow"("userId", "orderNoKey")
  WHERE "status" = 'SUCCESS'
    AND "revertedAt" IS NULL
    AND "orderNoKey" IS NOT NULL;
